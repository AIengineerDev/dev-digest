import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review, RunTrace } from '@devdigest/shared';

/**
 * Plan A5 (specs/09-project-context.md) — the cut wire from an agent's
 * attached project-context documents to the review prompt's `## Project
 * context` slot, and the trace fields that attribute it.
 *
 * Every assertion reads the PERSISTED run trace, the same discipline
 * `skills-assembly.it.test.ts` documents: what matters is what reached the
 * model, not what the assembler computed in isolation (already covered by
 * `test/project-context/assembler.test.ts`).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Nothing structural.',
  score: 90,
  findings: [],
};

let seq = 0;

d('project context → prompt assembly (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  }, 180_000);
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(files: Record<string, string> = {}) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF, files }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  type App = Awaited<ReturnType<typeof appWith>>;

  async function setupRepoAndPr(repo: { id: string; owner: string; name: string }) {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 900 + seq++,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  async function createRepo() {
    const name = `context-repo-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  async function createAgent(app: App, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `${name}-${seq++}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
        repo_intel: false,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json() as { id: string };
  }

  async function attach(
    app: App,
    repoId: string,
    path: string,
    targets: Array<{ target_kind: 'agent' | 'skill'; target_id: string }>,
  ) {
    const res = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/attachments`,
      payload: { path, targets },
    });
    expect(res.statusCode, res.body).toBe(200);
  }

  /** Run one review and return the persisted trace. */
  async function runAndTrace(app: App, prId: string, agentId: string): Promise<RunTrace> {
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } })
    ).json();
    const runId = body.runs[0].run_id;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    return (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
  }

  it('an attached document reaches the prompt under `## Project context`, attributed in the trace (spec A4, A5)', async () => {
    const repo = await createRepo();
    const app = await appWith({ 'docs/a.md': 'All public endpoints MUST be rate-limited.' });
    const pr = await setupRepoAndPr(repo);
    const agent = await createAgent(app, 'Grounded');
    await attach(app, repo.id, 'docs/a.md', [{ target_kind: 'agent', target_id: agent.id }]);

    const trace = await runAndTrace(app, pr.id, agent.id);

    expect(trace.prompt_assembly.specs).not.toBeNull();
    expect(trace.prompt_assembly.specs).toContain('All public endpoints MUST be rate-limited.');
    expect(trace.prompt_assembly.user).toContain('## Project context');
    expect(trace.prompt_assembly.user).toContain('All public endpoints MUST be rate-limited.');

    expect(trace.prompt_assembly.specs_tokens).toBeGreaterThan(0);
    expect(trace.prompt_assembly.specs_used).toEqual([
      { path: 'docs/a.md', sources: ['agent'], tokens: expect.any(Number), status: 'injected' },
    ]);
    expect(trace.specs_read).toEqual(['docs/a.md']);

    // No second copy of the document text outside specs/user (root INSIGHTS.md:211-219).
    const assemblyJson = JSON.stringify(trace.prompt_assembly);
    const occurrences = assemblyJson.split('All public endpoints MUST be rate-limited.').length - 1;
    expect(occurrences).toBe(2); // once in `specs`, once inside `user`

    await app.close();
  });

  it('an agent with no attachments produces a byte-identical prompt to the pre-feature baseline (spec R4)', async () => {
    const repo = await createRepo();
    const app = await appWith();
    const pr = await setupRepoAndPr(repo);
    const agent = await createAgent(app, 'Bare');

    const trace = await runAndTrace(app, pr.id, agent.id);

    expect(trace.prompt_assembly.specs).toBeNull();
    expect(trace.prompt_assembly.specs_used).toBeNull();
    expect(trace.prompt_assembly.specs_tokens).toBeNull();
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.user).not.toContain('## Project context');

    await app.close();
  });

  it('a document attached both directly and via a linked skill is injected once, with both sources listed (spec A7)', async () => {
    const repo = await createRepo();
    const app = await appWith({ 'docs/shared.md': 'Shared onboarding rules.' });
    const pr = await setupRepoAndPr(repo);
    const agent = await createAgent(app, 'DoubleAttached');

    const skillRes = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `onboarding-${seq++}`, description: 'x', type: 'convention', body: 'Follow onboarding.' },
    });
    expect(skillRes.statusCode).toBe(201);
    const skill = skillRes.json() as { id: string; name: string };

    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } });
    await attach(app, repo.id, 'docs/shared.md', [
      { target_kind: 'agent', target_id: agent.id },
      { target_kind: 'skill', target_id: skill.id },
    ]);

    const trace = await runAndTrace(app, pr.id, agent.id);

    // Injected exactly once — one occurrence of the doc text in `user`.
    const userOccurrences = trace.prompt_assembly.user.split('Shared onboarding rules.').length - 1;
    expect(userOccurrences).toBe(1);
    expect(trace.prompt_assembly.specs_used).toHaveLength(1);
    expect(trace.prompt_assembly.specs_used![0]!.sources.sort()).toEqual(['agent', `skill:${skill.name}`].sort());

    await app.close();
  });
});
