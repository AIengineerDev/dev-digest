import type { OnboardingSectionKind, TourRecord } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { RunLogger } from '../../platform/run-logger.js';
import { resolveFeatureModel } from '../_shared/feature-models.js';
import { TourRepository, type TourRow, type TourStateKey } from './repository.js';
import { TOUR_PROMPT_VERSION } from './constants.js';

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
    const indexState = await this.container.repoIntel.getIndexState(repoId);
    const key: TourStateKey = {
      repoId,
      indexedSha: indexState.lastIndexedSha,
      indexerVersion: indexState.indexerVersion,
      promptVersion: TOUR_PROMPT_VERSION,
      provider: choice.provider,
      model: choice.model,
    };
    const row = await this.repo.findByKey(key);
    if (!row) return null;
    return toTourRecord(row);
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

    return this.runGeneration(repoRow, choice, indexState, key, log);
  }

  /** C1's rendered refusal. Ephemeral — no `repository` call at all, so it
   *  can never collide with, or be confused for, a persisted row. */
  private notIndexedRefusal(
    repoId: string,
    choice: { provider: string; model: string },
  ): TourRecord {
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
   * The real generation pipeline (R2-R9, R14-R17, R24) — built out phase by
   * phase (A2 derivation/skeleton, A3 assembly, A4 the call/grounding/merge).
   * Unreachable from any Phase A1 test: every A1 case takes the not-indexed
   * refusal or the cache-hit path above.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async runGeneration(
    _repoRow: { id: string; owner: string; name: string; clonePath: string | null },
    _choice: { provider: string; model: string },
    _indexState: { lastIndexedSha: string; indexerVersion: number; status: string; filesSkipped: number },
    _key: TourStateKey,
    _log: TourLogger,
  ): Promise<TourRecord> {
    throw new Error('tour generation not yet implemented — lands in Phase A2-A4');
  }
}
