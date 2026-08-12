import type { Container } from '../../platform/container.js';
import type { DerivedIntent, PrIntentRecord } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { RunLogger } from '../../platform/run-logger.js';
import { resolveFeatureModel } from '../_shared/feature-models.js';
import type { ReviewRepository } from './repository.js';
import { collectIntentSignals, contentHash } from './intent-signals.js';
import { intentSystemPrompt, intentUserPrompt, IntentClassification } from './intent-prompt.js';
import {
  categoryFromConventionalPrefix,
  clampConfidence,
  fingerprintSignals,
  scopeTouchesChangedPaths,
} from './helpers.js';
import {
  EXTRACTION_SCHEMA_NAME,
  INTENT_MODEL_MAX_RETRIES,
  INTENT_MODEL_MAX_TOKENS,
  INTENT_MODEL_TEMPERATURE,
  INTENT_MODEL_TIMEOUT_MS,
  INTENT_PROMPT_VERSION,
  TAXONOMY_VERSION,
} from './intent-constants.js';

/** Minimal logging surface `derive()` needs — `RunLogger` satisfies it, both
 *  fanned over active runs (the wire, run-executor.ts) and standalone (the
 *  `POST /pulls/:id/intent` route, which fans out to zero runs). */
export type IntentDeriveLogger = Pick<RunLogger, 'info' | 'tool' | 'result' | 'error' | 'step'>;

/**
 * Derives a PR's intent (specs/04-intent-layer.md). Sampling and verification
 * are code; the model only proposes — this class is the orchestrator around
 * that: collect signals → fingerprint → cache check → one classification call →
 * clamp → persist. Every step short of the model call is deterministic; the
 * whole thing is best-effort and NEVER throws (mirrors `buildRepoMapDigest`).
 */
export class IntentService {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
  ) {}

  /** `GET /pulls/:id/intent` — `null` is a state ("not yet derived"), not a 404. */
  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const row = await this.repo.getIntent(prId);
    return row ? { ...row, pr_id: prId } : null;
  }

  /**
   * Steps 4–8 of the call sequence. `force:true` skips the cache-hit check
   * (step 6). Returns `null` when nothing was derived AND nothing was persisted
   * (no provider key configured) — every other outcome, including a degraded
   * row, is returned so the caller (route or run-executor) can act on it.
   */
  async derive(
    workspaceId: string,
    prId: string,
    opts: { force?: boolean } = {},
    log: IntentDeriveLogger,
  ): Promise<PrIntentRecord | null> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const repoRef = { owner: repoRow.owner, name: repoRow.name };

    // ---- 4. collect signals (best-effort, time-boxed) ----------------------
    const [commits, files] = await Promise.all([
      this.repo.getPrCommits(prId),
      this.repo.getPrFiles(prId),
    ]);
    const changedPaths = files.map((f) => f.path);
    const signals = await log.step(
      'Collecting intent signals',
      () => collectIntentSignals(this.container, repoRef, pull, commits, changedPaths),
      { kind: 'tool' },
    );
    for (const s of signals.sources) {
      log.info(
        s.used
          ? `intent source ${s.kind}: used${s.ref ? ` (${s.ref})` : ''}`
          : `intent source ${s.kind}: not used${s.note ? ` — ${s.note}` : ''}`,
      );
    }

    const choice = await resolveFeatureModel(this.container, workspaceId, 'review_intent');

    // ---- 5. fingerprint ------------------------------------------------------
    const fingerprint = fingerprintSignals({
      title: signals.title,
      body: signals.body,
      branch: signals.branch,
      commitSubjects: signals.commitSubjects,
      changedPaths: signals.changedPaths,
      issue: signals.issue
        ? { number: signals.issue.number, title: signals.issue.title, bodyHash: contentHash(signals.issue.body) }
        : null,
      docs: signals.docs.map((d) => ({ path: d.path, contentHash: contentHash(d.content) })),
      provider: choice.provider,
      model: choice.model,
      promptVersion: INTENT_PROMPT_VERSION,
      taxonomyVersion: TAXONOMY_VERSION,
    });

    // ---- 6. cache check --------------------------------------------------
    const existing = await this.repo.getIntent(prId);
    if (!opts.force && existing && existing.fingerprint === fingerprint && !existing.degraded) {
      log.info(`intent: reusing cached classification (${fingerprint.slice(0, 8)})`);
      return { ...existing, pr_id: prId };
    }

    // ---- 7. classify (one LLM call) ---------------------------------------
    let llm;
    try {
      llm = await this.container.llm(choice.provider);
    } catch (err) {
      log.info(`intent: classification skipped — ${(err as Error).message}; continuing without intent`);
      return null;
    }

    let classification;
    try {
      classification = await log.step(
        'Deriving PR intent',
        () =>
          llm.completeStructured<IntentClassification>({
            model: choice.model,
            schema: IntentClassification,
            schemaName: EXTRACTION_SCHEMA_NAME,
            temperature: INTENT_MODEL_TEMPERATURE,
            maxTokens: INTENT_MODEL_MAX_TOKENS,
            timeoutMs: INTENT_MODEL_TIMEOUT_MS,
            maxRetries: INTENT_MODEL_MAX_RETRIES,
            messages: [
              { role: 'system', content: intentSystemPrompt() },
              { role: 'user', content: intentUserPrompt(signals) },
            ],
          }),
        { kind: 'tool' },
      );
    } catch (err) {
      const msg = (err as Error).message;
      log.error(`intent: classification failed — ${msg}; continuing without intent`);
      // A degraded row with NO classification, so the next run retries rather
      // than serving a hole from cache.
      const degraded: DerivedIntent = {
        intent: '',
        in_scope: [],
        out_of_scope: [],
        category: 'unknown',
        summary: '',
        confidence: 0,
        band: 'low',
        sources: signals.sources,
        provider: choice.provider,
        model: choice.model,
        prompt_version: INTENT_PROMPT_VERSION,
        fingerprint,
        derived_at: null,
        degraded: true,
        error: msg,
      };
      await this.repo.upsertIntent(prId, degraded).catch(() => undefined);
      return { ...degraded, pr_id: prId };
    }

    // ---- 8. clamp confidence, persist --------------------------------------
    const hasDocumentationSource = signals.sources.some((s) => s.grade === 'documentation' && s.used);
    const scopeMatchesChangedPaths = scopeTouchesChangedPaths(
      [...classification.data.in_scope, ...classification.data.out_of_scope],
      changedPaths,
    );
    const clamp = clampConfidence({
      reported: classification.data.confidence,
      hasDocumentationSource,
      scopeMatchesChangedPaths,
    });
    if (clamp.clampedFrom !== null) {
      log.info(
        `intent: model claimed ${clamp.clampedFrom} but ${hasDocumentationSource ? 'scope claims did not match the changed paths' : 'no documentation-grade source'} — clamped to ${clamp.confidence} (${clamp.band})`,
      );
    }

    // Category hint from conventional-commit prefixes; never overrides the
    // model when it already committed to a non-unknown category.
    const category =
      classification.data.category !== 'unknown'
        ? classification.data.category
        : categoryFromConventionalPrefix(signals.commitSubjects);

    const derivedAt = new Date().toISOString();
    const intent: DerivedIntent = {
      intent: classification.data.summary,
      in_scope: classification.data.in_scope,
      out_of_scope: classification.data.out_of_scope,
      category,
      summary: classification.data.summary,
      confidence: clamp.confidence,
      band: clamp.band,
      sources: signals.sources,
      provider: choice.provider,
      model: choice.model,
      prompt_version: INTENT_PROMPT_VERSION,
      fingerprint,
      derived_at: derivedAt,
      degraded: false,
      error: null,
    };

    log.result(
      `intent: ${category} — "${intent.summary}" (confidence ${clamp.confidence.toFixed(2)} ${clamp.band}, ${choice.model}, ${classification.tokensIn}t in / ${classification.tokensOut}t out)`,
    );

    await this.repo.upsertIntent(prId, intent).catch((err) => {
      log.error(`intent: persist failed — ${(err as Error).message}`);
    });

    return { ...intent, pr_id: prId };
  }
}
