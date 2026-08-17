/**
 * GET /pulls/:id/blast.
 *
 * The grouping rules are pinned hermetically in `blast-helpers.test.ts`. What
 * needs a real Postgres is the wiring the helpers cannot see: that the route
 * feeds the PR's OWN changed files to the facade, that a PR nobody has opened
 * yet reports that state rather than an empty impact, and that the workspace
 * scope holds.
 *
 * The repo-intel facade is stubbed — it walks a git clone and a code index,
 * neither of which belongs in this test. Its real behaviour is covered by
 * `repo-intel-*.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel, BlastResult } from '../src/modules/repo-intel/types.js';
import type { BlastRadius } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

const FILES = ['src/middleware/ratelimit.ts', 'src/api/public/webhooks.ts'];

const BLAST: BlastResult = {
  changedSymbols: [
    { file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' },
    { file: 'src/middleware/ratelimit.ts', name: 'bucketKey', kind: 'function' },
  ],
  callers: [
    { file: 'src/server.ts', symbol: 'boot', viaSymbol: 'rateLimit', line: 40, rank: 0 },
    { file: 'src/api/public/index.ts', symbol: 'mount', viaSymbol: 'rateLimit', line: 8, rank: 0 },
    { file: 'src/middleware/ratelimit.ts', symbol: 'rateLimit', viaSymbol: 'bucketKey', line: 26, rank: 0 },
  ],
  impactedEndpoints: ['POST /webhooks'],
  factsByFile: {
    'src/server.ts': { endpoints: [], crons: ['nightly-sweep'] },
    'src/api/public/index.ts': { endpoints: ['POST /webhooks'], crons: [] },
    'src/middleware/ratelimit.ts': { endpoints: [], crons: [] },
  },
};

async function setupPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { withFiles?: boolean } = { withFiles: true },
) {
  const name = `blast-${repoSeq++}`;
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
    })
    .returning();
  if (opts.withFiles) {
    await db
      .insert(t.prFiles)
      .values(FILES.map((path) => ({ prId: pr!.id, path, additions: 10, deletions: 0, patch: null })));
  }
  return { repo: repo!, pr: pr! };
}

/** Captures what the route hands the facade, which is the wiring under test. */
function stubIntel(result: BlastResult = BLAST) {
  const seen: { repoId: string; files: string[] }[] = [];
  const repoIntel = {
    getBlastRadius: async (repoId: string, files: string[]) => {
      seen.push({ repoId, files });
      return result;
    },
  } as unknown as RepoIntel;
  return { repoIntel, seen };
}

const getBlast = async (db: PgFixture['handle']['db'], prId: string, repoIntel: RepoIntel) => {
  const app = await buildApp({
    config: config(),
    db,
    overrides: { github: new MockGitHubClient({ pulls: [] }), repoIntel },
  });
  return app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
};

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
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

  it("feeds the PR's own changed files to the index and returns the grouped impact", async () => {
    const { repo, pr } = await setupPr(pg.handle.db, workspaceId);
    const { repoIntel, seen } = stubIntel();

    const res = await getBlast(pg.handle.db, pr.id, repoIntel);
    expect(res.statusCode).toBe(200);
    const blast = res.json() as BlastRadius;

    // The route derives the file list server-side — that is why the MCP tool
    // and the UI only have to name the PR.
    expect(seen).toEqual([{ repoId: repo.id, files: FILES }]);

    expect(blast.changed_symbols.map((s) => s.name)).toEqual(['rateLimit', 'bucketKey']);
    expect(blast.downstream[0]!.symbol).toBe('rateLimit');
    expect(blast.downstream[0]!.callers.map((c) => c.file)).toEqual([
      'src/api/public/index.ts',
      'src/server.ts',
    ]);
    expect(blast.downstream[0]!.endpoints_affected).toEqual(['POST /webhooks']);
    expect(blast.downstream[0]!.crons_affected).toEqual(['nightly-sweep']);
    expect(blast.summary).toBe('2 changed symbols · 3 callers · 1 endpoint.');
  });

  it('reports the unimported state instead of an empty impact, and does not call the index', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId, { withFiles: false });
    const { repoIntel, seen } = stubIntel();

    const blast = (await getBlast(pg.handle.db, pr.id, repoIntel)).json() as BlastRadius;
    expect(seen).toEqual([]); // no files → nothing to ask the index about
    expect(blast.changed_symbols).toEqual([]);
    expect(blast.summary).toContain('No changed files recorded');
  });

  it('passes a degraded index through as an honest answer, not an error', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    const { repoIntel } = stubIntel({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    });

    const res = await getBlast(pg.handle.db, pr.id, repoIntel);
    expect(res.statusCode).toBe(200);
    expect((res.json() as BlastRadius).summary).toContain('a floor, not a finding');
  });

  it('404s a PR that belongs to another workspace', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-blast' }).returning();
    const { pr } = await setupPr(pg.handle.db, other!.id);
    const res = await getBlast(pg.handle.db, pr.id, stubIntel().repoIntel);
    expect(res.statusCode).toBe(404);
  });

  it('422s a non-uuid id at the route boundary', async () => {
    const res = await getBlast(pg.handle.db, 'not-a-uuid', stubIntel().repoIntel);
    expect(res.statusCode).toBe(422);
  });
});
