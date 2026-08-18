/**
 * POST /pulls/:id/brief, GET /pulls/:id/brief.
 *
 * The pure halves (R5's budget gate, R7's wrapping, R4's grounding) are pinned
 * hermetically in `brief-budget.test.ts` / `brief-prompt.test.ts` /
 * `brief-grounding.test.ts`. What needs a real Postgres is the wiring those
 * cannot see: the cache key, the cost of a repeat view, degrading on every
 * dependency failure without ever 5xx-ing, and the persisted trace fields.
 *
 * `container.repoIntel` is stubbed exactly as `blast.it.test.ts` does — its
 * real behaviour (walking a clone + code index) belongs to `repo-intel-*`
 * tests, not here. The seeded demo repo is never cloned
 * (`server/INSIGHTS.md`, 2026-08-13), so this stub is also the only way to
 * exercise the NON-degraded blast path locally.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel, BlastResult, IndexState } from '../src/modules/repo-intel/types.js';
import type { BriefRecord, LLMProvider, StructuredResult, StructuredRequest, GitHubClient } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

const FILES = ['src/middleware/ratelimit.ts', 'src/api/public/webhooks.ts'];

const HEALTHY_BLAST: BlastResult = {
  changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' }],
  callers: [{ file: 'src/server.ts', symbol: 'boot', viaSymbol: 'rateLimit', line: 40, rank: 0 }],
  impactedEndpoints: ['POST /webhooks'],
};

const HEALTHY_INDEX_STATE: IndexState = {
  repoId: 'irrelevant',
  status: 'full',
  filesIndexed: 10,
  filesSkipped: 0,
  durationMs: 5,
  lastIndexedSha: 'deadbeef',
  indexerVersion: 1,
  updatedAt: new Date(0),
};

const DEGRADED_INDEX_STATE: IndexState = {
  repoId: 'irrelevant',
  status: 'degraded',
  filesIndexed: 0,
  filesSkipped: 0,
  durationMs: 0,
  reason: 'no_data',
  lastIndexedSha: '',
  indexerVersion: 1,
  updatedAt: new Date(0),
  degraded: true,
  degradedReason: 'no_data',
};

function stubIntel(opts: { blast?: BlastResult; indexState?: IndexState } = {}) {
  const repoIntel = {
    getBlastRadius: async () => opts.blast ?? HEALTHY_BLAST,
    getIndexState: async () => opts.indexState ?? HEALTHY_INDEX_STATE,
  } as unknown as RepoIntel;
  return repoIntel;
}

/** A `Brief`-shaped fixture whose `review_focus` names a REAL changed path,
 *  so grounding keeps it. */
function briefFixture(overrides: Record<string, unknown> = {}) {
  return {
    what: 'Adds rate limiting to public API endpoints.',
    why: 'Prevents abuse of unauthenticated routes.',
    risk_level: 'medium',
    risks: [],
    review_focus: [{ kind: 'file', ref: 'src/middleware/ratelimit.ts', reason: 'the new limiter' }],
    ...overrides,
  };
}

/** A minimal LLM that throws on `completeStructured` — for the "the model
 *  failed" path (A10/C6). */
class ThrowingLLMProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  async listModels() {
    return [];
  }
  async complete() {
    return { text: '', model: '', tokensIn: 0, tokensOut: 0, costUsd: null };
  }
  async completeStructured<T>(_req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    throw new Error('provider unavailable (500)');
  }
  async embed() {
    return [];
  }
}

async function setupPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { withFiles?: boolean; body?: string | null } = {},
) {
  const withFiles = opts.withFiles ?? true;
  const name = `brief-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      headSha: 'a1b2c3d4',
      status: 'open',
      body: opts.body ?? null,
      additions: 40,
      deletions: 4,
      filesCount: FILES.length,
    })
    .returning();
  if (withFiles) {
    await db
      .insert(t.prFiles)
      .values(FILES.map((path) => ({ prId: pr!.id, path, additions: 10, deletions: 0, patch: null })));
    await db.insert(t.prCommits).values([
      { prId: pr!.id, sha: 'a1b2c3d4', message: 'feat: add rate limiter', author: 'marisa.koch' },
    ]);
  }
  return { repo: repo!, pr: pr! };
}

async function postBrief(
  db: PgFixture['handle']['db'],
  prId: string,
  overrides: {
    repoIntel?: RepoIntel;
    llm?: LLMProvider;
    github?: GitHubClient;
    body?: { force?: boolean };
  } = {},
) {
  const app = await buildApp({
    config: config(),
    db,
    overrides: {
      github: overrides.github ?? new MockGitHubClient({ pulls: [] }),
      repoIntel: overrides.repoIntel ?? stubIntel(),
      llm: { anthropic: overrides.llm ?? new MockLLMProvider('anthropic', { structured: briefFixture() }) },
    },
  });
  return app.inject({ method: 'POST', url: `/pulls/${prId}/brief`, payload: overrides.body ?? {} });
}

async function getBrief(db: PgFixture['handle']['db'], prId: string) {
  const app = await buildApp({
    config: config(),
    db,
    overrides: { github: new MockGitHubClient({ pulls: [] }), repoIntel: stubIntel() },
  });
  return app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
}

d('POST/GET /pulls/:id/brief (Testcontainers pg)', () => {
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

  it('R1 — GET is 200+null before any brief exists; POST persists a non-degraded record; GET then matches it', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const before = await getBrief(pg.handle.db, pr.id);
    expect(before.statusCode).toBe(200);
    expect(before.json()).toBeNull();

    const posted = await postBrief(pg.handle.db, pr.id);
    expect(posted.statusCode).toBe(200);
    const record = posted.json() as BriefRecord;
    expect(record.degraded).toBe(false);
    expect(record.pr_id).toBe(pr.id);
    expect(record.head_sha).toBe(pr.headSha);
    expect(record.review_focus.map((f) => f.ref)).toEqual(['src/middleware/ratelimit.ts']);

    const after = await getBrief(pg.handle.db, pr.id);
    expect((after.json() as BriefRecord).generated_at).toBe(record.generated_at);
  });

  it('A1 — two POSTs at an unchanged PR state make exactly ONE model call', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    const llm = new MockLLMProvider('anthropic', { structured: briefFixture() });

    const first = await postBrief(pg.handle.db, pr.id, { llm });
    expect(first.statusCode).toBe(200);
    const second = await postBrief(pg.handle.db, pr.id, { llm });
    expect(second.statusCode).toBe(200);

    // Two separate `buildApp` calls share nothing but the DB — the cache
    // key living entirely in Postgres, not in-process state, is the point.
    expect(llm.calls.filter((c) => c.method === 'completeStructured').length).toBe(1);
    expect((first.json() as BriefRecord).generated_at).toBe((second.json() as BriefRecord).generated_at);
  });

  it('C1 — zero pr_files rows: no model call, degraded with error "no_changed_files"', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId, { withFiles: false });
    const llm = new MockLLMProvider('anthropic', { structured: briefFixture() });

    const res = await postBrief(pg.handle.db, pr.id, { llm });
    expect(res.statusCode).toBe(200);
    const record = res.json() as BriefRecord;
    expect(record.degraded).toBe(true);
    expect(record.error).toBe('no_changed_files');
    expect(llm.calls.length).toBe(0);
  });

  it('A5 / C14 — a 300-file PR refuses over budget: no model call, error "input_over_budget"', async () => {
    const { repo, pr } = await setupPr(pg.handle.db, workspaceId, { withFiles: false });
    // 1 000 long, deeply-nested paths — enough that even the real BPE
    // tokenizer (~4 chars/token) comfortably clears 8 000 tokens on the file
    // list alone, none of which is droppable (every file is `core`, and core
    // is never dropped).
    const manyFiles = Array.from(
      { length: 1_000 },
      (_, i) =>
        `src/generated/very/deeply/nested/module-${String(i).padStart(5, '0')}/some-long-handler-name.ts`,
    );
    await pg.handle.db
      .insert(t.prFiles)
      .values(manyFiles.map((path) => ({ prId: pr.id, path, additions: 10, deletions: 2, patch: null })));
    void repo;
    const llm = new MockLLMProvider('anthropic', { structured: briefFixture() });

    const res = await postBrief(pg.handle.db, pr.id, { llm });
    expect(res.statusCode).toBe(200);
    const record = res.json() as BriefRecord;
    expect(record.degraded).toBe(true);
    expect(record.error).toBe('input_over_budget');
    expect(llm.calls.length).toBe(0);
  });

  it('A10 / C6 — the provider throws: 200, degraded, non-null error, cost_usd null', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    const res = await postBrief(pg.handle.db, pr.id, { llm: new ThrowingLLMProvider() });
    expect(res.statusCode).toBe(200);
    const record = res.json() as BriefRecord;
    expect(record.degraded).toBe(true);
    expect(record.error).toContain('provider unavailable');
    expect(record.cost_usd).toBeNull();
  });

  it('A11 / C7 / C8 — a missing intent, a degraded index, and an unreachable linked issue each degrade the INPUT, not the brief', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId, { body: 'Fixes #471 for real this time.' });
    // No pr_intent row was ever written for this PR → intent is null (C7's
    // sibling case, "null intent").
    const throwingGithub: GitHubClient = {
      listPullRequests: async () => [],
      getPullRequest: async () => {
        throw new Error('not implemented');
      },
      postReview: async () => ({ id: 'x' }),
      listReviewComments: async () => [],
      createReviewComment: async () => {
        throw new Error('not implemented');
      },
      openPullRequest: async () => ({ url: '' }),
      commitFiles: async () => ({ branch: '' }),
      findOpenPr: async () => null,
      getIssue: async () => {
        throw new Error('404 Not Found');
      },
      currentLogin: async () => 'mock-user',
    };

    const res = await postBrief(pg.handle.db, pr.id, {
      repoIntel: stubIntel({ indexState: DEGRADED_INDEX_STATE }),
      github: throwingGithub,
    });
    expect(res.statusCode).toBe(200);
    const record = res.json() as BriefRecord;
    expect(record.degraded).toBe(false); // the BRIEF is fine — only inputs are missing
    expect(record.dropped_inputs).toEqual(
      expect.arrayContaining(['intent:unavailable', 'blast:degraded', 'linked_issue:unreachable']),
    );
  });

  it('A13 — provider/model/tokens_in/tokens_out/budget_tokens/dropped_inputs/dropped_refs are non-null on the success path', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    const res = await postBrief(pg.handle.db, pr.id);
    const record = res.json() as BriefRecord;
    expect(record.provider).toBeTruthy();
    expect(record.model).toBeTruthy();
    expect(typeof record.tokens_in).toBe('number');
    expect(typeof record.tokens_out).toBe('number');
    expect(typeof record.budget_tokens).toBe('number');
    expect(Array.isArray(record.dropped_inputs)).toBe(true);
    expect(typeof record.dropped_refs).toBe('number');
  });

  it('A13 — the same trace fields are non-null on the FAILURE path too', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId, { withFiles: false });
    const res = await postBrief(pg.handle.db, pr.id);
    const record = res.json() as BriefRecord;
    expect(record.provider).toBeTruthy();
    expect(record.model).toBeTruthy();
    expect(typeof record.tokens_in).toBe('number');
    expect(typeof record.tokens_out).toBe('number');
    expect(typeof record.budget_tokens).toBe('number');
    expect(Array.isArray(record.dropped_inputs)).toBe(true);
    expect(typeof record.dropped_refs).toBe('number');
  });

  it('C13 vs C2 — a focus list that is entirely ungrounded degrades; a genuinely empty one does not', async () => {
    const { pr: prAllWrong } = await setupPr(pg.handle.db, workspaceId);
    const allWrong = await postBrief(pg.handle.db, prAllWrong.id, {
      llm: new MockLLMProvider('anthropic', {
        structured: briefFixture({
          review_focus: [{ kind: 'file', ref: 'src/does-not-exist.ts', reason: 'invented' }],
        }),
      }),
    });
    const wrongRecord = allWrong.json() as BriefRecord;
    expect(wrongRecord.degraded).toBe(true);
    expect(wrongRecord.error).toBe('ungrounded_output');
    expect(wrongRecord.review_focus).toEqual([]);
    expect(wrongRecord.dropped_refs).toBe(1);

    const { pr: prEmpty } = await setupPr(pg.handle.db, workspaceId);
    const empty = await postBrief(pg.handle.db, prEmpty.id, {
      llm: new MockLLMProvider('anthropic', { structured: briefFixture({ review_focus: [] }) }),
    });
    const emptyRecord = empty.json() as BriefRecord;
    expect(emptyRecord.degraded).toBe(false);
    expect(emptyRecord.review_focus).toEqual([]);
  });

  it('404s a PR that belongs to another workspace', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-brief' }).returning();
    const { pr } = await setupPr(pg.handle.db, other!.id);
    const res = await postBrief(pg.handle.db, pr.id);
    expect(res.statusCode).toBe(404);
  });

  it('422s a non-uuid id at the route boundary', async () => {
    const res = await postBrief(pg.handle.db, 'not-a-uuid');
    expect(res.statusCode).toBe(422);
  });

  // A18. Two things make this the one test in the file that cannot use the
  // helpers. First, the limiter counts per app instance, and postBrief() builds
  // a fresh app per call, so it would never accumulate. Second — and this is not
  // in the plan — `buildApp` registers @fastify/rate-limit only when
  // `nodeEnv !== 'test'` (`src/app.ts:95`), deliberately, so integration suites
  // can hammer endpoints through inject(). Under the file's own `config()` the
  // route's `{ max: 10 }` is inert and eleven POSTs all return 200. So this test
  // builds its app with NODE_ENV=development: it is the only configuration in
  // which A18 is falsifiable at all.
  it('A18 — refuses the 11th POST in a minute with 429', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'development' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        github: new MockGitHubClient({ pulls: [] }),
        repoIntel: stubIntel(),
        llm: { anthropic: new MockLLMProvider('anthropic', { structured: briefFixture() }) },
      },
    });

    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief`, payload: {} });
      codes.push(res.statusCode);
    }

    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
