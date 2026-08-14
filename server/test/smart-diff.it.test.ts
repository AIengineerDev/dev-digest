/**
 * GET /pulls/:id/smart-diff.
 *
 * The classification rules are pinned hermetically in
 * `smart-diff-helpers.test.ts`. What needs a real Postgres is the part the
 * helpers cannot see: that the route joins the PR's imported files to the
 * findings of every review AT THE CURRENT HEAD (all of a multi-agent run, not
 * just the newest row), that a review of an older head does not badge the
 * current diff, and that an unreviewed PR still returns a full ordered
 * response.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { SmartDiff, SmartDiffRole } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

const HEAD_SHA = 'a1b2c3d4';

/** The PR from the design mock: core logic, wiring, manifests and a lock file. */
const FILES = [
  { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
  { path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
  { path: 'src/api/public/index.ts', additions: 12, deletions: 2 },
  { path: 'src/server.ts', additions: 8, deletions: 1 },
  { path: 'src/config.ts', additions: 4, deletions: 0 },
  { path: 'src/api/users.ts', additions: 7, deletions: 2 },
  { path: 'package.json', additions: 3, deletions: 1 },
  { path: 'package-lock.json', additions: 92, deletions: 24 },
];

async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-${repoSeq++}`;
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
      headSha: HEAD_SHA,
      additions: 241,
      deletions: 36,
      filesCount: FILES.length,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values(FILES.map((f) => ({ prId: pr!.id, ...f, patch: null })));
  return { repo: repo!, pr: pr! };
}

async function addReview(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  createdAt: Date,
  findings: Array<{ file: string; startLine: number }>,
  headSha: string | null = HEAD_SHA,
) {
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      kind: 'review',
      verdict: 'request_changes',
      score: 40,
      createdAt,
      headSha,
    })
    .returning();
  if (findings.length > 0) {
    await db.insert(t.findings).values(
      findings.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.startLine,
        endLine: f.startLine,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Leaked credential',
        rationale: 'A live key is committed.',
        confidence: 0.9,
      })),
    );
  }
  return review!;
}

/** `GET /pulls/:id` refreshes from GitHub; smart-diff must not need one at all,
 *  so the app is built with no GitHub client configured. */
const getSmartDiff = async (db: PgFixture['handle']['db'], prId: string) => {
  const app = await buildApp({
    config: config(),
    db,
    overrides: { github: new MockGitHubClient({ pulls: [] }) },
  });
  const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
  return res;
};

const filesIn = (diff: SmartDiff, role: SmartDiffRole) =>
  diff.groups.find((g) => g.role === role)!.files;

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
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

  it('orders core first and keeps the lock file in boilerplate before any review', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    const res = await getSmartDiff(pg.handle.db, pr.id);
    expect(res.statusCode).toBe(200);
    const diff = res.json() as SmartDiff;

    expect(diff.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(filesIn(diff, 'core').map((f) => f.path)).toEqual([
      'src/middleware/ratelimit.ts',
      'src/api/public/webhooks.ts',
      'src/api/users.ts',
    ]);
    expect(filesIn(diff, 'boilerplate').map((f) => f.path)).toContain('package-lock.json');
    // No review yet → the response is complete but carries no badges.
    expect(diff.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(
      true,
    );
  });

  it('attaches the current head review findings as finding_lines', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    await addReview(pg.handle.db, workspaceId, pr.id, new Date('2026-06-01T10:00:00Z'), [
      { file: 'src/api/public/webhooks.ts', startLine: 61 },
      { file: 'src/api/public/webhooks.ts', startLine: 68 },
      { file: 'src/api/public/webhooks.ts', startLine: 73 },
      { file: 'src/config.ts', startLine: 12 },
    ]);

    const diff = (await getSmartDiff(pg.handle.db, pr.id)).json() as SmartDiff;
    const core = filesIn(diff, 'core');
    // Three findings put webhooks.ts above the file with two and a half times
    // its diff — findings outrank size.
    expect(core[0]!.path).toBe('src/api/public/webhooks.ts');
    expect(core[0]!.finding_lines).toEqual([61, 68, 73]);
    expect(filesIn(diff, 'wiring').find((f) => f.path === 'src/config.ts')!.finding_lines).toEqual([
      12,
    ]);
  });

  it('unions every agent of a multi-agent run at the same head', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    // One "run all agents" writes one review per agent. Scoping to the newest
    // row would show the last agent's findings and silently drop the rest.
    await addReview(pg.handle.db, workspaceId, pr.id, new Date('2026-06-01T10:00:00Z'), [
      { file: 'src/api/public/webhooks.ts', startLine: 61 },
    ]);
    await addReview(pg.handle.db, workspaceId, pr.id, new Date('2026-06-01T10:00:02Z'), [
      { file: 'src/middleware/ratelimit.ts', startLine: 28 },
    ]);

    const core = filesIn((await getSmartDiff(pg.handle.db, pr.id)).json() as SmartDiff, 'core');
    const byPath = new Map(core.map((f) => [f.path, f.finding_lines]));
    expect(byPath.get('src/middleware/ratelimit.ts')).toEqual([28]);
    expect(byPath.get('src/api/public/webhooks.ts')).toEqual([61]);
  });

  it('drops a review of an older head, and keeps one with no head recorded', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    await addReview(
      pg.handle.db,
      workspaceId,
      pr.id,
      new Date('2026-06-01T09:00:00Z'),
      [{ file: 'src/api/users.ts', startLine: 45 }],
      'stale-head',
    );
    // Rows written before reviews.head_sha existed carry null — unknown is not
    // stale, so these still badge the diff.
    await addReview(
      pg.handle.db,
      workspaceId,
      pr.id,
      new Date('2026-06-01T09:30:00Z'),
      [{ file: 'src/middleware/ratelimit.ts', startLine: 28 }],
      null,
    );

    const core = filesIn((await getSmartDiff(pg.handle.db, pr.id)).json() as SmartDiff, 'core');
    const byPath = new Map(core.map((f) => [f.path, f.finding_lines]));
    expect(byPath.get('src/api/users.ts')).toEqual([]);
    expect(byPath.get('src/middleware/ratelimit.ts')).toEqual([28]);
  });

  it('404s a PR that belongs to another workspace', async () => {
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other' })
      .returning();
    const { pr } = await setupPr(pg.handle.db, other!.id);
    const res = await getSmartDiff(pg.handle.db, pr.id);
    expect(res.statusCode).toBe(404);
  });

  it('422s a non-uuid id at the route boundary', async () => {
    const res = await getSmartDiff(pg.handle.db, 'not-a-uuid');
    expect(res.statusCode).toBe(422);
  });
});
