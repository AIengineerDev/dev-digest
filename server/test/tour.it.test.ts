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
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel, IndexState } from '../src/modules/repo-intel/types.js';
import type { TourRecord, LLMProvider } from '@devdigest/shared';

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

function stubIntel(opts: { indexState?: IndexState } = {}) {
  const repoIntel = {
    getIndexState: async () => opts.indexState ?? NO_ROW_INDEX_STATE,
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
  overrides: { repoIntel?: RepoIntel; llm?: LLMProvider; body?: { force?: boolean }; nodeEnv?: string } = {},
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
});
