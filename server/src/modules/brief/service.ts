import type { Brief, BriefRecord, Risk, ReviewFocusItem } from '@devdigest/shared';
import { Brief as BriefSchema } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { RunLogger } from '../../platform/run-logger.js';
import { resolveFeatureModel } from '../_shared/feature-models.js';
import { classifyPath } from '../_shared/file-roles.js';
import { BriefRepository, type BriefRecordRow } from './repository.js';
import { assembleBriefInput, shapeBlastForBrief } from './assemble.js';
import { groundBrief } from './grounding.js';
import {
  BRIEF_MODEL_MAX_RETRIES,
  BRIEF_MODEL_MAX_TOKENS,
  BRIEF_MODEL_TEMPERATURE,
  BRIEF_MODEL_TIMEOUT_MS,
  BRIEF_PROMPT_VERSION,
  BRIEF_SCHEMA_NAME,
} from './constants.js';

/** Minimal logging surface `generate()` needs — `RunLogger` satisfies it,
 *  fanned over zero runIds for the standalone `POST /pulls/:id/brief` call,
 *  same shape `IntentDeriveLogger` uses (`reviews/intent-service.ts:28`). */
export type BriefLogger = Pick<RunLogger, 'info' | 'tool' | 'result' | 'error' | 'step'>;

interface StateKey {
  prId: string;
  headSha: string;
  intentFingerprint: string | null;
  repoIndexedSha: string | null;
  promptVersion: number;
  provider: string;
  model: string;
}

function toBriefRecord(row: BriefRecordRow): BriefRecord {
  return {
    what: row.what,
    why: row.why,
    risk_level: row.riskLevel as BriefRecord['risk_level'],
    risks: row.risks as Risk[],
    review_focus: row.reviewFocus as ReviewFocusItem[],
    pr_id: row.prId,
    head_sha: row.headSha,
    intent_fingerprint: row.intentFingerprint,
    repo_indexed_sha: row.repoIndexedSha,
    provider: row.provider,
    model: row.model,
    prompt_version: row.promptVersion,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    budget_tokens: row.budgetTokens,
    dropped_inputs: row.droppedInputs,
    dropped_refs: row.droppedRefs,
    degraded: row.degraded,
    error: row.error,
    generated_at: row.generatedAt ? row.generatedAt.toISOString() : null,
  };
}

/**
 * PR Brief (specs/10-pr-brief.md) — a code-narrated, code-verified summary of
 * merge risk for one PR. Composes a repository with three adapters
 * (`tokenizer`, `llm`, `github`) and a facade (`repoIntel`), and applies rules
 * — budget dropping (`assemble.ts`), grounding (`grounding.ts`) — that are not
 * shape validation, which is what earns this a service
 * (same test `BlastService`/`SmartDiffService` pass).
 *
 * No transaction: generation is a single upsert
 * (`server/INSIGHTS.md`, 2026-08-09 — nothing here is atomic, and nothing
 * needs to be).
 */
export class BriefService {
  private readonly repo: BriefRepository;

  constructor(private readonly container: Container) {
    this.repo = new BriefRepository(container.db);
  }

  /** `GET /pulls/:id/brief` — `null` is a state ("not yet generated"), not a 404. */
  async get(workspaceId: string, prId: string): Promise<BriefRecord | null> {
    const pull = await this.repo.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const choice = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
    const [intent, indexState] = await Promise.all([
      this.container.reviewRepo.getIntent(pull.id),
      this.container.repoIntel.getIndexState(pull.repoId),
    ]);
    const key: StateKey = {
      prId: pull.id,
      headSha: pull.headSha,
      intentFingerprint: intent?.fingerprint ?? null,
      repoIndexedSha: indexState.lastIndexedSha || null,
      promptVersion: BRIEF_PROMPT_VERSION,
      provider: choice.provider,
      model: choice.model,
    };
    const row = await this.repo.findByKey(key);
    return row ? toBriefRecord(row) : null;
  }

  /**
   * `POST /pulls/:id/brief`. `force:true` skips the cache-hit check. Always
   * returns a `BriefRecord` — even the "nothing to say" (C1) and "the model
   * failed" (R12) paths persist a degraded row and return it; there is no
   * `null`-returning branch here (unlike `IntentService.derive`, which can
   * skip persisting when no provider key exists at all — the brief still
   * needs a row so a repeat view is free, per R6).
   */
  async generate(
    workspaceId: string,
    prId: string,
    opts: { force?: boolean } = {},
    log: BriefLogger,
  ): Promise<BriefRecord> {
    const pull = await this.repo.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const choice = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');

    // ---- cache check BEFORE any other work, mirroring IntentService.derive
    // steps 5-6: resolve the feature model, build the key, look up, return
    // unless `force`. A DEGRADED row is cached like any other (amendment A-2):
    // regenerating it on an ordinary `POST` would spend money on every page
    // view while a provider is down. The Retry control sends `force: true`
    // (`PrBriefCard.tsx`), which is how a human asks for another attempt. -
    const [intent, indexState] = await Promise.all([
      this.container.reviewRepo.getIntent(pull.id),
      this.container.repoIntel.getIndexState(pull.repoId),
    ]);
    const intentFingerprint = intent?.fingerprint ?? null;
    const repoIndexedSha = indexState.lastIndexedSha || null;
    const key: StateKey = {
      prId: pull.id,
      headSha: pull.headSha,
      intentFingerprint,
      repoIndexedSha,
      promptVersion: BRIEF_PROMPT_VERSION,
      provider: choice.provider,
      model: choice.model,
    };

    if (!opts.force) {
      const existing = await this.repo.findByKey(key);
      if (existing) {
        log.info(`brief: reusing cached brief (state unchanged, ${pull.headSha.slice(0, 8)})`);
        return toBriefRecord(existing);
      }
    }

    // ---- C1: no changed files → no call, degraded ----------------------
    const files = await this.repo.getFiles(pull.id);
    if (files.length === 0) {
      log.info('brief: no changed files recorded for this PR — skipped');
      return this.persistDegraded(key, 'no_changed_files', [], 0);
    }

    const notes: string[] = [];
    if (!intent || intent.degraded) notes.push('intent:unavailable');
    if (indexState.degraded) notes.push('blast:degraded');

    // ---- linked issue: the brief's own regex + `getIssue`, not
    // `resolveLinkedIssue` (private, not on the `GitHubClient` port). Never
    // throws (C7) — a missing token or an unreachable/private issue just
    // omits the input. ----------------------------------------------------
    let linkedIssue: { number: number; title: string; body: string } | null = null;
    const issueMatch = /(?:closes|fixes|resolves)?\s*#(\d+)/i.exec(pull.body ?? '');
    if (issueMatch) {
      try {
        const github = await this.container.github();
        const issue = await github.getIssue({ owner: repoRow.owner, name: repoRow.name }, Number(issueMatch[1]));
        linkedIssue = { number: issue.number, title: issue.title, body: issue.body ?? '' };
      } catch (err) {
        notes.push('linked_issue:unreachable');
        log.info(`brief: linked issue unreachable — ${(err as Error).message}`);
      }
    }

    // ---- blast: pass through verbatim, including a degraded summary.
    // `getBlastRadius` never substitutes zeros for a degraded index. --------
    const blastResult = await this.container.repoIntel.getBlastRadius(
      pull.repoId,
      files.map((f) => f.path),
    );
    const blast = shapeBlastForBrief(blastResult);

    // ---- assemble (pure, no model call — R5's pre-flight gate) -----------
    const assembled = assembleBriefInput({
      pr: {
        number: pull.number,
        title: pull.title,
        branch: pull.branch,
        base: pull.base,
        additions: pull.additions,
        deletions: pull.deletions,
        filesCount: pull.filesCount,
        body: pull.body,
      },
      files: files.map((f) => ({ ...f, role: classifyPath(f.path) })),
      commitSubjects: await this.repo.getCommitSubjects(pull.id),
      linkedIssue,
      blast,
      derivedIntent:
        intent && !intent.degraded
          ? {
              category: intent.category,
              summary: intent.summary,
              band: intent.band,
              inScope: intent.in_scope,
              outOfScope: intent.out_of_scope,
            }
          : null,
      projectContext: [],
      count: (s) => this.container.tokenizer.count(s),
    });

    if (!assembled.ok) {
      log.error(
        'brief: estimated billed input still exceeds the 8000-token budget after every droppable input — refusing',
      );
      return this.persistDegraded(
        key,
        'input_over_budget',
        [...notes, ...assembled.droppedInputs],
        assembled.tokens,
      );
    }

    // ---- the ONE model call. maxRetries: 0 (correction C-4 / A-1) —
    // a malformed response degrades, it is never repaired. -----------------
    let llm;
    try {
      llm = await this.container.llm(choice.provider);
    } catch (err) {
      log.info(`brief: generation skipped — ${(err as Error).message}`);
      return this.persistDegraded(
        key,
        (err as Error).message,
        [...notes, ...assembled.droppedInputs],
        assembled.tokens,
      );
    }

    let result;
    try {
      result = await log.step(
        'Generating PR brief',
        () =>
          llm.completeStructured<Brief>({
            model: choice.model,
            schema: BriefSchema,
            schemaName: BRIEF_SCHEMA_NAME,
            temperature: BRIEF_MODEL_TEMPERATURE,
            maxTokens: BRIEF_MODEL_MAX_TOKENS,
            timeoutMs: BRIEF_MODEL_TIMEOUT_MS,
            maxRetries: BRIEF_MODEL_MAX_RETRIES,
            messages: [
              { role: 'system', content: assembled.system },
              { role: 'user', content: assembled.user },
            ],
          }),
        { kind: 'tool' },
      );
    } catch (err) {
      const msg = (err as Error).message;
      log.error(`brief: generation failed — ${msg}`);
      return this.persistDegraded(key, msg, [...notes, ...assembled.droppedInputs], assembled.tokens);
    }

    // ---- grounding (R4): the reference set comes from the ASSEMBLED input,
    // not the database — a dropped `boilerplate` file is correctly no longer
    // a valid ref. ----------------------------------------------------------
    const grounded = groundBrief({
      brief: result.data,
      referenceFiles: [...assembled.filesUsed, ...blast.changedSymbols.map((s) => s.file)],
      referenceEndpoints: blast.endpointsAffected,
    });
    if (grounded.dropped.length > 0) {
      log.info(`brief: dropped ${grounded.dropped.length} ungrounded ref(s): ${grounded.dropped.join(', ')}`);
    }

    // C2 vs C13: the model legitimately returning an empty focus list is a
    // normal brief; the model returning entries that ALL fail grounding is a
    // degraded one — `kept.length === 0` alone conflates the two.
    const ungroundedOutput = grounded.focusReturned > 0 && grounded.focusKept === 0;

    const row = await this.repo.upsert({
      ...key,
      what: grounded.brief.what,
      why: grounded.brief.why,
      riskLevel: grounded.brief.risk_level,
      risks: grounded.brief.risks,
      reviewFocus: grounded.brief.review_focus,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: ungroundedOutput ? null : result.costUsd,
      budgetTokens: assembled.tokens,
      droppedInputs: [...notes, ...assembled.droppedInputs],
      droppedRefs: grounded.droppedRefs,
      degraded: ungroundedOutput,
      error: ungroundedOutput ? 'ungrounded_output' : null,
      generatedAt: new Date(),
    });

    log.result(
      `brief: ${row.riskLevel} risk — ${row.risks.length} risk(s), ${row.reviewFocus.length} focus entr${row.reviewFocus.length === 1 ? 'y' : 'ies'} ` +
        `(${choice.model}, ${result.tokensIn}t in / ${result.tokensOut}t out)`,
    );

    return toBriefRecord(row);
  }

  private async persistDegraded(
    key: StateKey,
    error: string,
    droppedInputs: string[],
    budgetTokens: number,
  ): Promise<BriefRecord> {
    const row = await this.repo.upsert({
      ...key,
      what: '',
      why: '',
      riskLevel: 'low',
      risks: [],
      reviewFocus: [],
      tokensIn: 0,
      tokensOut: 0,
      costUsd: null,
      budgetTokens,
      droppedInputs,
      droppedRefs: 0,
      degraded: true,
      error,
      generatedAt: null,
    });
    return toBriefRecord(row);
  }
}
