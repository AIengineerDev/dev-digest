import type { FeatureModelChoice, OnboardingSection, OnboardingSectionKind, TourRecord } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import type { RunLogger } from '../../platform/run-logger.js';
import { resolveFeatureModel } from '../_shared/feature-models.js';
import { withFeatureProviderContext } from '../_shared/provider-errors.js';
import { discoverDocuments } from '../_shared/doc-discovery.js';
import { TourRepository, type TourRow, type TourStateKey } from './repository.js';
import {
  TOUR_MODEL_MAX_RETRIES,
  TOUR_MODEL_MAX_TOKENS,
  TOUR_MODEL_TIMEOUT_MS,
  TOUR_PROMPT_VERSION,
  TOUR_SCHEMA_NAME,
} from './constants.js';
import { TourAnnotations } from './schemas.js';
import { assembleTourInput, type AssembleTourInput } from './assemble.js';
import { buildTree } from './derive/tree.js';
import { buildDiagram } from './derive/diagram.js';
import { buildChains } from './derive/chains.js';
import { deriveConfig, type ReadFile } from './derive/config.js';
import { buildReading } from './derive/reading.js';
import { buildCandidates, type DerivedCandidate } from './derive/candidates.js';
import { buildSkeleton, type CandidateWithSignal } from './derive/skeleton.js';
import { computeDifficulty } from './derive/difficulty.js';
import { groundPaths, filterSteps, filterAnnotations, applyDifficulty } from './grounding.js';
import { mergeAnnotations } from './merge.js';
import { resolveSections } from './resolve.js';

/** Minimal logging surface `generate()` needs — `RunLogger` satisfies it,
 *  fanned over zero runIds for the standalone `POST /repos/:id/tour` call,
 *  same shape `BriefLogger` uses (`modules/brief/service.ts`). */
export type TourLogger = Pick<RunLogger, 'info' | 'tool' | 'result' | 'error' | 'step'>;

const ALL_SECTION_KINDS: OnboardingSectionKind[] = [
  'architecture_overview',
  'critical_paths',
  'how_to_run',
  'guided_reading',
  'first_tasks',
];

/** How many top-ranked files feed the reading list, the symbol-signature
 *  block (P8) and the unresolved-reference generator's re-parse. */
const READING_POOL_SIZE = 20;

function toTourRecord(row: TourRow): TourRecord {
  return {
    sections: row.sections as TourRecord['sections'],
    repo_id: row.repoId,
    indexed_sha: row.indexedSha,
    indexer_version: row.indexerVersion,
    prompt_version: row.promptVersion,
    provider: row.provider,
    model: row.model,
    trace: row.trace as TourRecord['trace'],
    degraded: row.degraded,
    error: row.error,
    skeleton_sections: row.skeletonSections as OnboardingSectionKind[],
    dropped_inputs: row.droppedInputs,
    dropped_refs: row.droppedRefs,
    dropped_steps: row.droppedSteps,
    index_status: row.indexStatus,
    files_skipped: row.filesSkipped,
    current_indexed_sha: row.indexedSha,
    generated_at: row.generatedAt.toISOString(),
  };
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '(root)' : path.slice(0, idx) || '(root)';
}

export interface BudgetComparison {
  ratio: number;
  withinTolerance: boolean;
}

/**
 * A18 — is the counted `budget_tokens` within 15% of what the provider
 * actually billed (`tokens_in`)? Hermetic and boundary-tested; the
 * MEASUREMENT (whether a real generation lands inside that band) is J1's
 * manual step — only a real provider reports `usage.input_tokens`.
 */
export function compareBudgetToBilled(budget: number, tokensIn: number): BudgetComparison {
  if (budget <= 0) return { ratio: Infinity, withinTolerance: false };
  const ratio = tokensIn / budget;
  // A tiny epsilon absorbs float error at the exact 15% boundary (e.g.
  // 850/1000 - 1 can land at -0.15000000000000002, not exactly -0.15).
  return { ratio, withinTolerance: Math.abs(ratio - 1) <= 0.15 + 1e-9 };
}

/**
 * Onboarding tour (specs/12-onboarding-generator.md) — a deterministic
 * skeleton the server derives in code (R24), optionally annotated by exactly
 * one structured model call whose prose is merged onto that skeleton by
 * server-supplied id (R7). Composes a repository with three adapters
 * (`tokenizer`, `llm`, `codeIndex`), one port (`git`) and one facade
 * (`repoIntel`), and applies rules — budget dropping, four grounding gates, a
 * difficulty rubric, an annotation merge — that are not shape validation,
 * which is what earns this a service (same test `BriefService`/`BlastService`
 * pass).
 *
 * No transaction: generation is a single upsert
 * (`server/INSIGHTS.md`, 2026-08-09 — nothing here is atomic, and nothing
 * needs to be).
 */
export class TourService {
  private readonly repo: TourRepository;

  constructor(private readonly container: Container) {
    this.repo = new TourRepository(container.db);
  }

  /** `GET /repos/:id/tour` — `null` is a state ("not yet generated"), not a
   *  404 (the repo itself not existing IS a 404). */
  async get(workspaceId: string, repoId: string): Promise<TourRecord | null> {
    const repoRow = await this.repo.findRepo(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const choice = await resolveFeatureModel(this.container, workspaceId, 'onboarding');
    // Deliberately NOT keyed on indexedSha/indexerVersion (C19) — a re-index
    // must not make a previously-generated tour vanish from GET; it must
    // come back marked stale instead. `generate()`'s cache check below uses
    // the full key; this is the one exception, and it exists only to read.
    const row = await this.repo.findLatestForRepo({
      repoId,
      promptVersion: TOUR_PROMPT_VERSION,
      provider: choice.provider,
      model: choice.model,
    });
    if (!row) return null;

    const indexState = await this.container.repoIntel.getIndexState(repoId);
    const currentIndexedFiles = await this.container.repoIntel.getIndexedFiles(repoId);
    const record = toTourRecord(row);
    return {
      ...record,
      sections: resolveSections(record.sections, currentIndexedFiles),
      index_status: indexState.status,
      files_skipped: indexState.filesSkipped,
      current_indexed_sha: indexState.lastIndexedSha,
    };
  }

  /**
   * `POST /repos/:id/tour`. `force: true` skips the cache-hit check.
   *
   * R18/C1 (checked before anything else that could cost money or write a
   * row): a repo with no `repo_index_state` row or `status: 'failed'` is the
   * ONE hard refusal — a rendered explanation, never a `5xx`, and NEVER
   * persisted (`specs/12-onboarding-generator.md:361`). `getIndexState`
   * synthesises a `status: 'degraded'` sentinel with `lastIndexedSha: ''`
   * when no row exists yet (`repo-intel/service.ts:192-208`), which is the
   * signal this check actually keys off — `status === 'degraded'` alone
   * would incorrectly also block a repo that IS indexed but running
   * degraded, which R18 says should proceed with a banner instead.
   */
  async generate(
    workspaceId: string,
    repoId: string,
    opts: { force?: boolean } = {},
    log: TourLogger,
  ): Promise<TourRecord> {
    const repoRow = await this.repo.findRepo(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const choice = await resolveFeatureModel(this.container, workspaceId, 'onboarding');
    const indexState = await this.container.repoIntel.getIndexState(repoId);

    if (indexState.lastIndexedSha === '' || indexState.status === 'failed') {
      log.info('tour: repo is not indexed (or its index failed) — refusing, no call, no row written');
      return this.notIndexedRefusal(repoId, choice);
    }

    const key: TourStateKey = {
      repoId,
      indexedSha: indexState.lastIndexedSha,
      indexerVersion: indexState.indexerVersion,
      promptVersion: TOUR_PROMPT_VERSION,
      provider: choice.provider,
      model: choice.model,
    };

    if (!opts.force) {
      const existing = await this.repo.findByKey(key);
      if (existing) {
        log.info('tour: reusing cached tour (repo state unchanged)');
        return toTourRecord(existing);
      }
    }

    return this.runGeneration(
      repoRow,
      choice,
      { indexStatus: indexState.status, filesSkipped: indexState.filesSkipped },
      key,
      log,
    );
  }

  /** C1's rendered refusal. Ephemeral — no `repository` call at all, so it
   *  can never collide with, or be confused for, a persisted row. */
  private notIndexedRefusal(repoId: string, choice: FeatureModelChoice): TourRecord {
    return {
      sections: ALL_SECTION_KINDS.map((kind) => ({
        kind,
        title: kind,
        body: null,
        diagram: null,
        links: [],
      })),
      repo_id: repoId,
      indexed_sha: '',
      indexer_version: 0,
      prompt_version: TOUR_PROMPT_VERSION,
      provider: choice.provider,
      model: choice.model,
      trace: {
        budget_tokens: 0,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        provider: choice.provider,
        model: choice.model,
        prompt_version: TOUR_PROMPT_VERSION,
      },
      degraded: true,
      error: 'not_indexed',
      skeleton_sections: ALL_SECTION_KINDS,
      dropped_inputs: [],
      dropped_refs: 0,
      dropped_steps: 0,
      index_status: 'failed',
      files_skipped: 0,
      current_indexed_sha: '',
      generated_at: new Date(0).toISOString(),
    };
  }

  /**
   * The real generation pipeline (R2-R9, R14-R17, R24):
   *   1. fetch every derivable input from the repoIntel facade + git,
   *   2. build the complete skeleton (A2, no model call yet),
   *   3. assemble + budget-gate the one prompt (A3),
   *   4. exactly one `completeStructured` call, wrapped so a missing key
   *      degrades instead of 5xx-ing (A4.2/A4.3),
   *   5. filter + ground the response, merge it onto the skeleton by id,
   *   6. persist with the single R15 trace block.
   */
  private async runGeneration(
    repoRow: { id: string; owner: string; name: string; clonePath: string | null },
    choice: FeatureModelChoice,
    indexInfo: { indexStatus: string; filesSkipped: number },
    key: TourStateKey,
    log: TourLogger,
  ): Promise<TourRecord> {
    const repoRef = { owner: repoRow.owner, name: repoRow.name };
    const intel = this.container.repoIntel;

    const indexedFiles = await intel.getIndexedFiles(repoRow.id);
    const fileRanks = await intel.getFileRank(repoRow.id, indexedFiles);
    const percentileByPath = new Map(fileRanks.map((r) => [r.path, r.percentile]));
    const percentileOf = (path: string): number | null => percentileByPath.get(path) ?? null;

    const edges = await intel.getFileEdges(repoRow.id);
    const criticalPathsRaw = await intel.getCriticalPaths(repoRow.id);
    const fileFacts = await intel.getFileFacts(repoRow.id, indexedFiles);

    const readFile: ReadFile = (path) => this.container.git.readFile(repoRef, path);

    // ---- documents (P6 + candidates' "documented" set) --------------------
    let discoveredDocPaths: string[] = [];
    const documentedFiles = new Set<string>();
    const promptDocuments: { path: string; content: string }[] = [];
    if (repoRow.clonePath) {
      const discovery = await discoverDocuments(repoRow.clonePath).catch(() => ({ docs: [], truncated: false }));
      discoveredDocPaths = discovery.docs.map((d) => d.path);
      for (const doc of discovery.docs) {
        if (doc.tooLarge) continue;
        try {
          const content = await readFile(doc.path);
          documentedFiles.add(doc.path);
          for (const file of indexedFiles) {
            if (content.includes(file)) documentedFiles.add(file);
          }
          const isReadme = /^readme\.md$/i.test(doc.path);
          const isArchLike = /(architecture|contributing|overview)/i.test(doc.path);
          if ((isReadme || isArchLike) && promptDocuments.length < 2) {
            promptDocuments.push({ path: doc.path, content: content.slice(0, 4_000) });
          }
        } catch {
          // unreadable doc — skip, not a failure
        }
      }
    }

    // ---- how-to-run config facts (R4, R5) -----------------------------------
    const config = await deriveConfig(readFile);

    // ---- reading pool: rank-ordered, feeds reading/signatures/unresolved ---
    const rankedPool = await intel.getTopFilesByRank(repoRow.id, READING_POOL_SIZE);
    const symbolRows = await intel.getSymbolsInFiles(repoRow.id, rankedPool);
    const unresolvedRefs = await intel.getUnresolvedReferences(repoRow.id, rankedPool);

    // ---- chains + reading -------------------------------------------------
    const chains = buildChains(criticalPathsRaw, fileFacts);
    const chainHeads = new Set(criticalPathsRaw.map((c) => c[0]).filter((f): f is string => !!f));
    const reading = buildReading(rankedPool, chainHeads, percentileOf);

    // ---- candidates (R8) — grep in its own timeout, inside candidates.ts ---
    const endpointFacts = fileFacts.filter((f) => f.endpoints.length > 0);
    const candidates: DerivedCandidate[] = await buildCandidates({
      allFiles: indexedFiles,
      unresolvedRefs,
      endpointFacts,
      documentedFiles,
      grep: async (pattern) => this.container.codeIndex.grep(repoRef, pattern),
    });

    // ---- difficulty inputs (R9) — one getBlastRadius per candidate scope ---
    const candidatesWithSignal: CandidateWithSignal[] = [];
    for (const candidate of candidates) {
      const blast = await intel.getBlastRadius(repoRow.id, [candidate.scope]);
      const callers = new Set(blast.callers.map((c) => c.file)).size;
      candidatesWithSignal.push({ candidate, callers, rankPercentile: percentileOf(candidate.scope) });
    }

    // ---- the skeleton (A2, R24) — the base case, not an error path --------
    const tree = buildTree(indexedFiles.map((path) => ({ path, percentile: percentileOf(path) })));
    const diagram = buildDiagram(edges);
    const skeleton = buildSkeleton({ tree, diagram, chains, config, reading, candidates: candidatesWithSignal });

    // ---- assembly (A3) — no model call yet ---------------------------------
    const directoryEdgeFacts = [
      ...new Set(edges.map((e) => `${dirOf(e.fromFile)} ${dirOf(e.toFile)}`)),
    ]
      .map((pair) => pair.split(' ') as [string, string])
      .filter(([from, to]) => from !== to)
      .map(([from, to]) => ({ from, to }));

    const systemPrompt = await renderPrompt('onboarding.system.md', { language: 'English' });
    const repoFacts = [
      `${repoRow.owner}/${repoRow.name}`,
      `index status: ${indexInfo.indexStatus}`,
      `files skipped: ${indexInfo.filesSkipped}`,
      `indexed files: ${indexedFiles.length}`,
    ].join(', ');

    const assembleInput: AssembleTourInput = {
      system: systemPrompt,
      repoFacts,
      tree: tree.map((t) => ({ path: t.path, files: t.files, roleMix: t.role_mix, topFile: t.top_file, folded: t.folded })),
      directoryEdges: directoryEdgeFacts,
      chains: chains.chains.map((c) => ({ chain_id: c.chain_id, files: c.files, endpoints: c.endpoints })),
      documents: promptDocuments,
      rankedReading: reading.reading.map((r) => ({ path: r.path, rank_percentile: r.rank_percentile })),
      symbolSignatures: symbolRows
        .filter((s): s is typeof s & { signature: string } => s.signature !== null)
        .map((s) => ({ file: s.file, symbol: s.name, signature: s.signature })),
      config: {
        packageManager: config.packageManager,
        scripts: config.scripts,
        envExampleVars: config.envExampleVars,
        composeServices: config.composeServices,
        dockerfilePresent: config.dockerfilePresent,
        whitelist: config.whitelist,
      },
      candidates: candidates.map((c) => ({ candidate_id: c.candidate_id, kind: c.kind, scope: c.scope, line: c.line, snippet: c.snippet })),
      difficultyInputs: candidatesWithSignal.map((c) => ({
        candidate_id: c.candidate.candidate_id,
        callers: c.callers,
        rank_percentile: c.rankPercentile,
      })),
      count: (s) => this.container.tokenizer.count(s),
    };

    const assembled = assembleTourInput(assembleInput);

    const referenceFiles = [...indexedFiles, ...tree.map((t) => t.path), ...discoveredDocPaths];
    const difficultyByCandidateId = new Map(
      candidatesWithSignal.map((c) => [c.candidate.candidate_id, computeDifficulty(c.callers, c.rankPercentile)]),
    );

    if (!assembled.ok) {
      log.error('tour: estimated input still exceeds the 12 000-token ceiling after every droppable input — refusing');
      return this.persistSkeleton(key, skeleton, choice, {
        error: 'input_over_budget',
        droppedInputs: assembled.droppedInputs,
        budgetTokens: assembled.tokens,
        indexStatus: indexInfo.indexStatus,
        filesSkipped: indexInfo.filesSkipped,
      });
    }

    // ---- the ONE model call (A8) -------------------------------------------
    let result;
    try {
      result = await withFeatureProviderContext(
        { id: 'onboarding', label: 'Onboarding Tour', provider: choice.provider, model: choice.model },
        async () => {
          const llm = await this.container.llm(choice.provider as 'openai' | 'anthropic' | 'openrouter');
          return log.step(
            'Generating onboarding tour',
            () =>
              llm.completeStructured<TourAnnotations>({
                model: choice.model,
                schema: TourAnnotations,
                schemaName: TOUR_SCHEMA_NAME,
                maxTokens: TOUR_MODEL_MAX_TOKENS,
                timeoutMs: TOUR_MODEL_TIMEOUT_MS,
                maxRetries: TOUR_MODEL_MAX_RETRIES,
                messages: [
                  { role: 'system', content: assembled.system },
                  { role: 'user', content: assembled.user },
                ],
              }),
            { kind: 'tool' },
          );
        },
      );
    } catch (err) {
      // C15 — a truncated/schema-invalid response is a TOTAL parse failure,
      // never trusted field-by-field.
      const isMalformed = err instanceof ExternalServiceError;
      const message = isMalformed ? 'malformed_response' : (err as Error).message;
      log.error(`tour: generation failed — ${message}`);
      return this.persistSkeleton(key, skeleton, choice, {
        error: message,
        droppedInputs: assembled.droppedInputs,
        budgetTokens: assembled.tokens,
        indexStatus: indexInfo.indexStatus,
        filesSkipped: indexInfo.filesSkipped,
      });
    }

    // ---- filter (R5, R8) → merge (R24) → ground (R10) → difficulty (R9) ---
    const knownIds = {
      treeDirs: new Set(tree.map((t) => t.path)),
      chainIds: new Set(chains.chains.map((c) => c.chain_id)),
      readingPaths: new Set(reading.reading.map((r) => r.path)),
      candidateIds: new Set(candidates.map((c) => c.candidate_id)),
    };
    const filtered = filterAnnotations(result.data, knownIds);
    const merged = mergeAnnotations(skeleton, filtered.annotations);
    const stepsResult = filterSteps(merged.sections, config.whitelist);
    if (stepsResult.dropped.length > 0) {
      log.info(`tour: dropped ${stepsResult.dropped.length} non-whitelisted command(s): ${stepsResult.dropped.join(', ')}`);
    }
    const groundedResult = groundPaths(stepsResult.sections, referenceFiles);
    if (groundedResult.dropped.length > 0) {
      log.info(`tour: dropped ${groundedResult.dropped.length} ungrounded ref(s): ${groundedResult.dropped.join(', ')}`);
    }
    const finalSections = applyDifficulty(groundedResult.sections, difficultyByCandidateId);

    const trace = {
      budget_tokens: assembled.tokens,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
      provider: choice.provider,
      model: choice.model,
      prompt_version: TOUR_PROMPT_VERSION,
    };

    const row = await this.repo.upsert({
      ...key,
      sections: finalSections,
      degraded: false,
      error: null,
      skeletonSections: merged.skeletonSections,
      droppedInputs: assembled.droppedInputs,
      droppedRefs: groundedResult.droppedRefs + filtered.droppedRefs,
      droppedSteps: stepsResult.droppedSteps,
      indexStatus: indexInfo.indexStatus,
      filesSkipped: indexInfo.filesSkipped,
      trace,
      generatedAt: new Date(),
    });

    const comparison = compareBudgetToBilled(assembled.tokens, result.tokensIn);
    if (!comparison.withinTolerance) {
      log.info(
        `tour: billed input tokens (${result.tokensIn}) is outside 15% of the pre-flight budget (${assembled.tokens}) — ratio ${comparison.ratio.toFixed(2)}`,
      );
    }

    log.result(`tour: generated (${choice.model}, ${result.tokensIn}t in / ${result.tokensOut}t out)`);
    return toTourRecord(row);
  }

  private async persistSkeleton(
    key: TourStateKey,
    skeleton: OnboardingSection[],
    choice: FeatureModelChoice,
    opts: {
      error: string;
      droppedInputs: string[];
      budgetTokens: number;
      indexStatus: string;
      filesSkipped: number;
    },
  ): Promise<TourRecord> {
    const row = await this.repo.upsert({
      ...key,
      sections: skeleton,
      degraded: true,
      error: opts.error,
      skeletonSections: ALL_SECTION_KINDS,
      droppedInputs: opts.droppedInputs,
      droppedRefs: 0,
      droppedSteps: 0,
      indexStatus: opts.indexStatus,
      filesSkipped: opts.filesSkipped,
      trace: {
        budget_tokens: opts.budgetTokens,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        provider: choice.provider,
        model: choice.model,
        prompt_version: TOUR_PROMPT_VERSION,
      },
      generatedAt: new Date(),
    });
    return toTourRecord(row);
  }
}
