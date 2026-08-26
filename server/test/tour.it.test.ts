/**
 * POST /repos/:id/tour, GET /repos/:id/tour.
 *
 * The pure halves (derivation, budget, prompt wrapping, grounding, merge,
 * resolve) are pinned hermetically in `test/tour-*.test.ts`. What needs a
 * real Postgres is the wiring those cannot see: the cache key, the cost of a
 * repeat view, the R18/C1 hard refusal, the rate limit, and the persisted
 * trace fields.
 *
 * `container.repoIntel` is stubbed exactly as `brief.it.test.ts` /
 * `blast.it.test.ts` do — its real behaviour belongs to `repo-intel-*` tests,
 * not here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel, IndexState } from '../src/modules/repo-intel/types.js';
import type { GitClient, RepoRef, TourRecord, LLMProvider, CodeIndex, StructuredRequest, StructuredResult } from '@devdigest/shared';

/**
 * `MockGitClient.readFile` returns `''` and never throws
 * (`server/INSIGHTS.md`, 2026-08-19) — using it directly for "this repo has
 * no package.json/compose/Dockerfile" would exercise the found-but-empty
 * branch, not the absent-file one. This subclass throws ENOENT for anything
 * not explicitly supplied, matching `SimpleGitClient.readFile`'s real
 * behaviour (`adapters/git/simple-git.ts:129-130`).
 */
class ThrowingConfigGitClient extends MockGitClient {
  constructor(private readonly configFiles: Record<string, string>) {
    super();
  }
  override async readFile(_repo: RepoRef, path: string): Promise<string> {
    if (path in this.configFiles) return this.configFiles[path]!;
    throw new Error(`ENOENT: no such file, open '${path}'`);
  }
}

function stubCodeIndex(matches: { path: string; line: number; text: string }[] = []): CodeIndex {
  return {
    grep: async () => matches,
    symbols: async () => [],
    references: async () => [],
  };
}

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

const FAILED_INDEX_STATE: IndexState = {
  repoId: 'irrelevant',
  status: 'failed',
  filesIndexed: 0,
  filesSkipped: 0,
  durationMs: 0,
  reason: 'index_failed',
  lastIndexedSha: '',
  indexerVersion: 2,
  updatedAt: new Date(0),
};

const NO_ROW_INDEX_STATE: IndexState = {
  repoId: 'irrelevant',
  status: 'degraded',
  filesIndexed: 0,
  filesSkipped: 0,
  durationMs: 0,
  reason: 'no_data',
  lastIndexedSha: '', // the sentinel getIndexState synthesises for "no row"
  indexerVersion: 2,
  updatedAt: new Date(0),
  degraded: true,
  degradedReason: 'no_data',
};

const HEALTHY_INDEX_STATE: IndexState = {
  repoId: 'irrelevant',
  status: 'full',
  filesIndexed: 3,
  filesSkipped: 0,
  durationMs: 5,
  lastIndexedSha: 'deadbeef',
  indexerVersion: 2,
  updatedAt: new Date(0),
};

/** A small, realistic repo shape that produces a NON-EMPTY skeleton on
 *  every one of the five sections — tree, diagram, chains, run_steps, and
 *  first_tasks (A9's "every derived collection non-empty" bar). */
function stubIntel(opts: { indexState?: IndexState; healthy?: boolean } = {}) {
  if (!opts.healthy) {
    const repoIntel = { getIndexState: async () => opts.indexState ?? NO_ROW_INDEX_STATE } as unknown as RepoIntel;
    return repoIntel;
  }

  const indexedFiles = ['src/api/route.ts', 'src/service.ts', 'src/util.ts'];
  const rankRows = [
    { path: 'src/api/route.ts', percentile: 95 },
    { path: 'src/service.ts', percentile: 60 },
    { path: 'src/util.ts', percentile: 10 },
  ];
  const repoIntel = {
    getIndexState: async () => opts.indexState ?? HEALTHY_INDEX_STATE,
    getIndexedFiles: async () => indexedFiles,
    getFileRank: async () => rankRows,
    getFileEdges: async () => [{ fromFile: 'src/api/route.ts', toFile: 'src/service.ts' }],
    getCriticalPaths: async () => [['src/api/route.ts', 'src/service.ts']],
    getFileFacts: async () => [{ filePath: 'src/api/route.ts', endpoints: ['GET /x'], crons: [] }],
    getTopFilesByRank: async () => ['src/api/route.ts', 'src/service.ts', 'src/util.ts'],
    getSymbolsInFiles: async () => [],
    getUnresolvedReferences: async () => [],
    getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [] }),
  } as unknown as RepoIntel;
  return repoIntel;
}

async function setupRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `tour-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

async function postTour(
  db: PgFixture['handle']['db'],
  repoId: string,
  overrides: {
    repoIntel?: RepoIntel;
    llm?: LLMProvider;
    git?: GitClient;
    codeIndex?: CodeIndex;
    tokenizerCount?: (s: string) => number;
    body?: { force?: boolean };
    nodeEnv?: string;
  } = {},
) {
  const app = await buildApp({
    config: loadConfig({
      ...process.env,
      NODE_ENV: overrides.nodeEnv ?? 'test',
    } as NodeJS.ProcessEnv),
    db,
    overrides: {
      repoIntel: overrides.repoIntel ?? stubIntel(),
      llm: overrides.llm ? { anthropic: overrides.llm } : undefined,
      git: overrides.git,
      codeIndex: overrides.codeIndex ?? stubCodeIndex(),
      tokenizer: overrides.tokenizerCount ? { count: overrides.tokenizerCount } : undefined,
    },
  });
  return app.inject({ method: 'POST', url: `/repos/${repoId}/tour`, payload: overrides.body ?? {} });
}

async function getTour(db: PgFixture['handle']['db'], repoId: string, repoIntel?: RepoIntel) {
  const app = await buildApp({
    config: config(),
    db,
    overrides: { repoIntel: repoIntel ?? stubIntel() },
  });
  return app.inject({ method: 'GET', url: `/repos/${repoId}/tour` });
}

d('POST/GET /repos/:id/tour (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('R1 — GET is 200+null before any tour exists', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const res = await getTour(pg.handle.db, repo.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });

  it('C1 — no repo_index_state row: refuses, no model call, no row written', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const llm = new MockLLMProvider('anthropic');

    const res = await postTour(pg.handle.db, repo.id, {
      repoIntel: stubIntel({ indexState: NO_ROW_INDEX_STATE }),
      llm,
    });
    expect(res.statusCode).toBe(200);
    const record = res.json() as TourRecord;
    expect(record.degraded).toBe(true);
    expect(record.error).toBe('not_indexed');
    expect(record.skeleton_sections.length).toBe(5);
    expect(llm.calls.length).toBe(0);

    const rows = await pg.handle.db.select().from(t.onboardingTours);
    expect(rows.length).toBe(0);

    // A subsequent GET still returns null — nothing was persisted.
    const after = await getTour(pg.handle.db, repo.id, stubIntel({ indexState: NO_ROW_INDEX_STATE }));
    expect(after.json()).toBeNull();
  });

  it("C1 — index status 'failed': same refusal, no model call, no row written", async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const llm = new MockLLMProvider('anthropic');

    const res = await postTour(pg.handle.db, repo.id, {
      repoIntel: stubIntel({ indexState: FAILED_INDEX_STATE }),
      llm,
    });
    expect(res.statusCode).toBe(200);
    const record = res.json() as TourRecord;
    expect(record.degraded).toBe(true);
    expect(llm.calls.length).toBe(0);

    const rows = await pg.handle.db.select().from(t.onboardingTours);
    expect(rows.length).toBe(0);
  });

  // A18/A19 — the rate limit. `buildApp` only registers @fastify/rate-limit
  // when `nodeEnv !== 'test'` (`src/app.ts`), deliberately, so integration
  // suites can hammer endpoints through inject(). This test builds its OWN
  // app under NODE_ENV=development — the one configuration where the limit
  // is falsifiable at all — and never shares that instance with any other
  // test, or leaked rate-limit state would make this test order-dependent
  // (`specs/10-pr-brief.md` A18's lesson).
  it('A19 — refuses the 6th POST in a minute with 429, on its own Fastify instance', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'development' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { repoIntel: stubIntel({ indexState: NO_ROW_INDEX_STATE }) },
    });

    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/tour`, payload: {} });
      codes.push(res.statusCode);
    }

    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  const PROJECT_GIT = () =>
    new ThrowingConfigGitClient({
      'package.json': JSON.stringify({ packageManager: 'pnpm@9.0.0', scripts: { dev: 'tsx watch' } }),
    });

  function tourAnnotations(overrides: Record<string, unknown> = {}) {
    return {
      architecture: { body: 'Two files, one calls the other.', dirs: [] },
      critical_paths: null,
      how_to_run: null,
      guided_reading: null,
      first_tasks: null,
      ...overrides,
    };
  }

  it('A1 — two POSTs at an unchanged repo state make exactly ONE model call, and the second returns the same record', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const llm = new MockLLMProvider('anthropic', { structured: tourAnnotations() });

    const first = await postTour(pg.handle.db, repo.id, {
      repoIntel: stubIntel({ healthy: true }),
      llm,
      git: PROJECT_GIT(),
    });
    expect(first.statusCode).toBe(200);
    const second = await postTour(pg.handle.db, repo.id, {
      repoIntel: stubIntel({ healthy: true }),
      llm,
      git: PROJECT_GIT(),
    });
    expect(second.statusCode).toBe(200);

    expect(llm.calls.filter((c) => c.method === 'completeStructured').length).toBe(1);
    expect((first.json() as TourRecord).generated_at).toBe((second.json() as TourRecord).generated_at);
  });

  it('A8 — exactly one invocation, maxRetries: 0 asserted on the request the mock actually received', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const llm = new MockLLMProvider('anthropic', { structured: tourAnnotations() });

    const res = await postTour(pg.handle.db, repo.id, { repoIntel: stubIntel({ healthy: true }), llm, git: PROJECT_GIT() });
    expect(res.statusCode).toBe(200);

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls.length).toBe(1);
    expect((structuredCalls[0]!.req as StructuredRequest<unknown>).maxRetries).toBe(0);
  });

  it('A9/C13 — an LLM that throws yields 200, degraded: true, all five in skeleton_sections, every derived collection non-empty, cost_usd null, budget_tokens recorded', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    class ThrowingLLM implements LLMProvider {
      readonly id = 'anthropic' as const;
      async listModels() {
        return [];
      }
      async complete() {
        return { text: '', model: '', tokensIn: 0, tokensOut: 0, costUsd: null };
      }
      async completeStructured<T>(_req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        throw new Error('provider unavailable');
      }
      async embed() {
        return [];
      }
    }

    const res = await postTour(pg.handle.db, repo.id, {
      repoIntel: stubIntel({ healthy: true }),
      llm: new ThrowingLLM(),
      git: PROJECT_GIT(),
    });
    expect(res.statusCode).toBe(200);
    const record = res.json() as TourRecord;
    expect(record.degraded).toBe(true);
    expect(record.skeleton_sections.sort()).toEqual(
      ['architecture_overview', 'critical_paths', 'how_to_run', 'guided_reading', 'first_tasks'].sort(),
    );
    for (const s of record.sections) {
      expect(s.body).toBeNull();
    }
    const arch = record.sections.find((s) => s.kind === 'architecture_overview')!;
    const paths = record.sections.find((s) => s.kind === 'critical_paths')!;
    const howToRun = record.sections.find((s) => s.kind === 'how_to_run')!;
    const reading = record.sections.find((s) => s.kind === 'guided_reading')!;
    const tasks = record.sections.find((s) => s.kind === 'first_tasks')!;
    expect(arch.tree!.length).toBeGreaterThan(0);
    expect(paths.paths!.length).toBeGreaterThan(0);
    expect(howToRun.run_steps!.length).toBeGreaterThan(0);
    expect(reading.reading!.length).toBeGreaterThan(0);
    expect(tasks.tasks!.length).toBeGreaterThan(0);
    expect(record.trace.cost_usd).toBeNull();
    expect(record.trace.tokens_in).toBeNull();
    expect(record.trace.budget_tokens).toBeGreaterThan(0);
  });

  it('C15 — a schema-invalid/truncated response is a total parse failure: error "malformed_response", same populated-skeleton shape as C13', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    // `maxRetries: 0` + an invalid structured payload makes the REAL adapter
    // throw `ExternalServiceError` after one attempt (`adapters/llm/anthropic.ts`).
    // A mock LLM can't reproduce that adapter-internal schema check, so this
    // simulates the resulting THROW shape directly — the service's C15
    // branch only cares that the error is an `ExternalServiceError`.
    class MalformedLLM implements LLMProvider {
      readonly id = 'anthropic' as const;
      async listModels() {
        return [];
      }
      async complete() {
        return { text: '', model: '', tokensIn: 0, tokensOut: 0, costUsd: null };
      }
      async completeStructured<T>(_req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        const { ExternalServiceError } = await import('../src/platform/errors.js');
        throw new ExternalServiceError('schema validation failed');
      }
      async embed() {
        return [];
      }
    }

    const res = await postTour(pg.handle.db, repo.id, {
      repoIntel: stubIntel({ healthy: true }),
      llm: new MalformedLLM(),
      git: PROJECT_GIT(),
    });
    expect(res.statusCode).toBe(200);
    const record = res.json() as TourRecord;
    expect(record.degraded).toBe(true);
    expect(record.error).toBe('malformed_response');
  });

  it('A17 — the trace column is set on both the success path and the input_over_budget refusal path', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const llm = new MockLLMProvider('anthropic', { structured: tourAnnotations() });
    const res = await postTour(pg.handle.db, repo.id, { repoIntel: stubIntel({ healthy: true }), llm, git: PROJECT_GIT() });
    const record = res.json() as TourRecord;
    expect(record.trace.provider).toBe('anthropic');
    expect(record.trace.prompt_version).toBeTruthy();
    expect(record.trace.budget_tokens).toBeGreaterThan(0);
  });

  it('A7 — over the 12 000-token ceiling: zero model calls, a persisted record whose derived sections are still non-empty', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const llm = new MockLLMProvider('anthropic', { structured: tourAnnotations() });

    const res = await postTour(pg.handle.db, repo.id, {
      repoIntel: stubIntel({ healthy: true }),
      llm,
      git: PROJECT_GIT(),
      tokenizerCount: () => 999_999, // forces input_over_budget regardless of prompt size
    });
    expect(res.statusCode).toBe(200);
    const record = res.json() as TourRecord;
    expect(record.degraded).toBe(true);
    expect(record.error).toBe('input_over_budget');
    expect(llm.calls.filter((c) => c.method === 'completeStructured').length).toBe(0);

    const arch = record.sections.find((s) => s.kind === 'architecture_overview')!;
    const paths = record.sections.find((s) => s.kind === 'critical_paths')!;
    expect(arch.tree!.length).toBeGreaterThan(0);
    expect(paths.paths!.length).toBeGreaterThan(0);
  });

  it('C18 — two concurrent regenerates: last-write-wins on the native upsert, never a duplicate row', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const llm = new MockLLMProvider('anthropic', { structured: tourAnnotations() });

    await Promise.all([
      postTour(pg.handle.db, repo.id, { repoIntel: stubIntel({ healthy: true }), llm, git: PROJECT_GIT(), body: { force: true } }),
      postTour(pg.handle.db, repo.id, { repoIntel: stubIntel({ healthy: true }), llm, git: PROJECT_GIT(), body: { force: true } }),
    ]);

    const rows = await pg.handle.db.select().from(t.onboardingTours).where(eq(t.onboardingTours.repoId, repo.id));
    expect(rows.length).toBe(1);
  });

  it('C19 — a re-index changes the current sha, but GET still finds the record, marks it stale, and never discards it', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const llm = new MockLLMProvider('anthropic', { structured: tourAnnotations() });

    const posted = await postTour(pg.handle.db, repo.id, { repoIntel: stubIntel({ healthy: true }), llm, git: PROJECT_GIT() });
    const generated = posted.json() as TourRecord;
    expect(generated.indexed_sha).toBe('deadbeef');

    const reindexed: IndexState = { ...HEALTHY_INDEX_STATE, lastIndexedSha: 'newsha123' };
    const after = await getTour(pg.handle.db, repo.id, stubIntel({ healthy: true, indexState: reindexed }));
    expect(after.statusCode).toBe(200);
    const record = after.json() as TourRecord;
    expect(record).not.toBeNull();
    expect(record.indexed_sha).toBe('deadbeef'); // the record's own generation-time sha, unchanged
    expect(record.current_indexed_sha).toBe('newsha123'); // the CURRENT index's sha
  });

  it("R18 partial — GET reports the CURRENT index_status/files_skipped, not the generation-time ones", async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const llm = new MockLLMProvider('anthropic', { structured: tourAnnotations() });
    await postTour(pg.handle.db, repo.id, { repoIntel: stubIntel({ healthy: true }), llm, git: PROJECT_GIT() });

    const partial: IndexState = { ...HEALTHY_INDEX_STATE, status: 'partial', filesSkipped: 7 };
    const after = await getTour(pg.handle.db, repo.id, stubIntel({ healthy: true, indexState: partial }));
    const record = after.json() as TourRecord;
    expect(record.index_status).toBe('partial');
    expect(record.files_skipped).toBe(7);
  });
});
