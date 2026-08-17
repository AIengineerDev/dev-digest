/**
 * GET /pulls/:id — the PR detail refresh.
 *
 * This endpoint had no end-to-end coverage before, and it is the one that
 * carries a transaction: the refresh replaces the PR's files and commits
 * wholesale, so interrupted between the delete and the insert it would leave a
 * PR with no files at all — which surfaces as "the diff vanished", not as an
 * error. Wholesale replacement and the offline fallback are the two edges that
 * matter, and both are real SQL, so this runs against a real Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { GitHubClient, PrDetail } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `detailed-${repoSeq++}`;
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
      additions: 0,
      deletions: 0,
      filesCount: 0,
      status: 'open',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

const getDetail = async (
  db: PgFixture['handle']['db'],
  prId: string,
  github: GitHubClient,
) => {
  const app = await buildApp({ config: config(), db, overrides: { github } });
  const res = await app.inject({ method: 'GET', url: `/pulls/${prId}` });
  return res;
};

d('PR detail refresh (Testcontainers pg)', () => {
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

  it('returns the refreshed detail and persists files, commits and diff stats', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await getDetail(pg.handle.db, pr.id, new MockGitHubClient());
    expect(res.statusCode).toBe(200);

    const body = res.json() as PrDetail;
    expect(body.id).toBe(pr.id);
    expect(body.files).toHaveLength(1);
    expect(body.files[0]!.path).toBe('src/config.ts');

    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    const commits = await pg.handle.db
      .select()
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, pr.id));
    expect(files).toHaveLength(1);
    expect(commits).toHaveLength(1);

    // The row was created with zeroed stats; the refresh backfills them so the
    // Pull Requests list can show a real size.
    const [row] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.id, pr.id));
    expect(row!.filesCount).toBe(9);
    expect(row!.additions).toBe(247);
    expect(row!.body).toContain('rate limiting');
  });

  it('persists the head the refreshed files belong to, in the same write', async () => {
    // The bug this pins: the refresh replaced pr_files with the NEW head's
    // patches while `pull_requests.head_sha` kept naming the old one. Smart
    // Diff picks which findings badge a diff by comparing that column to each
    // review's head, so the previous commit's findings attached to a diff they
    // had never seen — and rendered as marks on lines nobody had reviewed.
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'stale-head' })
      .where(eq(t.pullRequests.id, pr.id));

    const res = await getDetail(pg.handle.db, pr.id, new MockGitHubClient());
    const body = res.json() as PrDetail;

    const [row] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.id, pr.id));
    // What the caller was told and what the row says must be the same head.
    expect(row!.headSha).toBe(body.head_sha);
    expect(row!.headSha).toBe('a1b2c3d4');
  });

  it('replaces the previous files wholesale rather than appending', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: 'src/deleted-since.ts',
      additions: 1,
      deletions: 1,
      patch: null,
    });

    await getDetail(pg.handle.db, pr.id, new MockGitHubClient());

    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    expect(files.map((f) => f.path)).toEqual(['src/config.ts']);
  });

  it('serves persisted detail when GitHub is unavailable, instead of failing', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    // Seed what a previous successful refresh would have left behind.
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: 'src/persisted.ts',
      additions: 2,
      deletions: 0,
      patch: null,
    });

    const offline: GitHubClient = Object.assign(new MockGitHubClient(), {
      getPullRequest: async () => {
        throw new Error('offline');
      },
    });

    const res = await getDetail(pg.handle.db, pr.id, offline);
    expect(res.statusCode).toBe(200);

    const body = res.json() as PrDetail;
    expect(body.id).toBe(pr.id);
    expect(body.files.map((f) => f.path)).toEqual(['src/persisted.ts']);
  });

  it('404s for a pull request that is not in the workspace', async () => {
    const res = await getDetail(
      pg.handle.db,
      '00000000-0000-0000-0000-000000000000',
      new MockGitHubClient(),
    );
    expect(res.statusCode).toBe(404);
  });
});
