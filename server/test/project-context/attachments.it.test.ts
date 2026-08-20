import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../helpers/pg.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/platform/config.js';
import { seed } from '../../src/db/seed.js';
import * as t from '../../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../../src/adapters/mocks.js';
import type { RepoRef } from '@devdigest/shared';

/**
 * `MockGitClient.readFile` degrades an unknown path to `''` rather than
 * throwing (`src/adapters/mocks.ts:293-295`), which is convenient elsewhere
 * but hides R10's "missing" behaviour — the real `SimpleGitClient` throws
 * ENOENT. This subclass restores that so the missing-document tests below
 * exercise the real code path (`getDocument`'s try/catch).
 */
class ThrowsOnMissingGitClient extends MockGitClient {
  constructor(private known: Record<string, string>) {
    super({ files: known });
  }
  override async readFile(_repo: RepoRef, path: string): Promise<string> {
    if (!(path in this.known)) throw new Error(`ENOENT: ${path}`);
    return this.known[path]!;
  }
}

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

/**
 * project-context attachments + doc detail over a real Postgres, through the
 * HTTP seam (plan A3). `target_id` carries no FK (schema/project-context.ts:
 * "it points into one of two tables and Postgres has no polymorphic FK"), so
 * these tests use bare uuids rather than real agent/skill rows — attachment
 * CRUD is target-agnostic by design.
 */
d('project-context attachments', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const repoName = `context-repo-${randomUUID().slice(0, 8)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: repoName, fullName: `acme/${repoName}` })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(files: Record<string, string> = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new ThrowsOnMissingGitClient(files), github: new MockGitHubClient() },
    });
  }

  it('attaching a document to an agent shows up in its doc detail; detaching removes it (spec A2)', async () => {
    const app = await makeApp({ 'docs/a.md': '# doc a' });
    const agentId = randomUUID();

    const attach = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/attachments`,
      payload: { path: 'docs/a.md', targets: [{ target_kind: 'agent', target_id: agentId }] },
    });
    expect(attach.statusCode, attach.body).toBe(200);
    expect(attach.json().attachments).toEqual([
      { path: 'docs/a.md', target_kind: 'agent', target_id: agentId, order: 0 },
    ]);

    const detail = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/doc?path=docs/a.md` });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json()).toMatchObject({
      path: 'docs/a.md',
      content: '# doc a',
      missing: false,
      attachments: [{ target_kind: 'agent', target_id: agentId }],
    });

    const detach = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/attachments`,
      payload: { path: 'docs/a.md', targets: [] },
    });
    expect(detach.statusCode, detach.body).toBe(200);
    expect(detach.json().attachments).toEqual([]);

    const afterDetach = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/doc?path=docs/a.md` });
    expect(afterDetach.json().attachments).toEqual([]);
  });

  it('attaching to both an agent and a skill in one call is order-independent per target (append semantics)', async () => {
    const app = await makeApp({ 'docs/b.md': '# doc b' });
    const agentId = randomUUID();
    const skillId = randomUUID();

    const res = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/attachments`,
      payload: {
        path: 'docs/b.md',
        targets: [
          { target_kind: 'agent', target_id: agentId },
          { target_kind: 'skill', target_id: skillId },
        ],
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const rows = res.json().attachments as Array<{ target_kind: string; target_id: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.target_kind).sort()).toEqual(['agent', 'skill']);
  });

  it('rejects attaching a document over the 400 KB size ceiling (spec C4)', async () => {
    const big = 'x'.repeat(401 * 1024);
    const app = await makeApp({ 'docs/huge.md': big });
    const res = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/attachments`,
      payload: { path: 'docs/huge.md', targets: [{ target_kind: 'agent', target_id: randomUUID() }] },
    });
    expect(res.statusCode).toBe(422);
  });

  it('a ../.. path escaping the clone root is rejected and never read (spec R11)', async () => {
    const app = await makeApp({});
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?${new URLSearchParams({ path: '../../etc/passwd' }).toString()}`,
    });
    expect(res.statusCode).toBe(400);

    const attachRes = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/attachments`,
      payload: { path: '../../etc/passwd', targets: [{ target_kind: 'agent', target_id: randomUUID() }] },
    });
    expect(attachRes.statusCode).toBe(400);

    // Nothing was written for the escaping path.
    const rows = await pg.handle.db
      .select()
      .from(t.projectContextAttachments)
      .where(
        and(
          eq(t.projectContextAttachments.repoId, repoId),
          eq(t.projectContextAttachments.path, '../../etc/passwd'),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it('a document with no content in the clone is reported missing, not a 404 (spec R10)', async () => {
    const app = await makeApp({}); // no files at all
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/doc?path=docs/gone.md` });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ path: 'docs/gone.md', missing: true, content: '', tokens: null });
  });

  it('404s for a repo id that does not exist', async () => {
    const app = await makeApp({});
    const res = await app.inject({ method: 'GET', url: `/repos/${randomUUID()}/context/doc?path=a.md` });
    expect(res.statusCode).toBe(404);
  });
});
