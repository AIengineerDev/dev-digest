import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/ratelimit.ts b/src/ratelimit.ts
--- a/src/ratelimit.ts
+++ b/src/ratelimit.ts
@@ -49,4 +49,5 @@
   const bucket = new Map();
+  bucket.set(key, count + 1);
   return bucket;
 }`;

/** One CRITICAL finding — enough to prove the run wrote through end to end. */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Missing rate-limit reset.',
  score: 50,
  findings: [
    {
      id: 'f-1',
      severity: 'CRITICAL',
      category: 'bug',
      title: 'Bucket never resets',
      file: 'src/ratelimit.ts',
      start_line: 51,
      end_line: 51,
      rationale: 'The bucket accumulates forever.',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `multi-agent-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 501,
      title: 'Fix rate limiter',
      author: 'marisa.koch',
      branch: 'fix/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Fix the rate limiter bucket.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/ratelimit.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -49,4 +49,5 @@\n   const bucket = new Map();\n+  bucket.set(key, count + 1);\n   return bucket;\n }',
  });
  return { repo: repo!, pr: pr! };
}

d('multi-agent runs (Testcontainers pg)', () => {
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

  function appWith(structured: unknown) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured }) },
      },
    });
  }

  it('a two-agent run shares one non-null multi_agent_run_id', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Agent A', provider: 'openai', model: 'gpt-4.1', system_prompt: 'a' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Agent B', provider: 'openai', model: 'gpt-4.1', system_prompt: 'b' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentIds: [agentA.id, agentB.id] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(2);
    expect(body.multi_agent_run_id).not.toBeNull();

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const runIds = body.runs.map((r: { run_id: string }) => r.run_id);
    const rows = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.prId, pr.id));
    const memberRows = rows.filter((r) => runIds.includes(r.id));
    expect(memberRows).toHaveLength(2);
    const groupIds = new Set(memberRows.map((r) => r.multiAgentRunId));
    expect(groupIds.size).toBe(1);
    expect([...groupIds][0]).toBe(body.multi_agent_run_id);
    // each member has its own status, independently
    for (const row of memberRows) expect(row.status).toBe('done');

    // GET /pulls/:id/runs returns the group id on each RunSummary
    const runsList = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })
    ).json();
    for (const r of runsList) {
      if (runIds.includes(r.run_id)) {
        expect(r.multi_agent_run_id).toBe(body.multi_agent_run_id);
      }
    }

    await app.close();
  });

  it('a single-agent run leaves multi_agent_run_id null with no group row written', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Solo', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    const before = await pg.handle.db.select().from(t.multiAgentRuns);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const body = res.json();
    expect(body.runs).toHaveLength(1);
    expect(body.multi_agent_run_id).toBeNull();

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const [run] = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, body.runs[0].run_id));
    expect(run!.multiAgentRunId).toBeNull();

    const after = await pg.handle.db.select().from(t.multiAgentRuns);
    expect(after.length).toBe(before.length);

    await app.close();
  });

  it('GET /pulls/:id/multi-agent-runs/:id returns runs + a group with a silent take', async () => {
    const EMPTY_FIXTURE: Review = { verdict: 'approve', summary: 'Looks fine.', score: 95, findings: [] };
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          anthropic: new MockLLMProvider('anthropic', { structured: EMPTY_FIXTURE }),
        },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Flags It', provider: 'openai', model: 'gpt-4.1', system_prompt: 'a' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Stays Silent', provider: 'anthropic', model: 'claude-x', system_prompt: 'b' },
      })
    ).json();

    const runRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentIds: [agentA.id, agentB.id] },
    });
    const runBody = runRes.json();
    const multiAgentRunId = runBody.multi_agent_run_id as string;
    expect(multiAgentRunId).not.toBeNull();

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const viewRes = await app.inject({
      method: 'GET',
      url: `/pulls/${pr.id}/multi-agent-runs/${multiAgentRunId}`,
    });
    expect(viewRes.statusCode).toBe(200);
    const view = viewRes.json();
    expect(view.runs).toHaveLength(2);
    expect(view.groups).toHaveLength(1);

    const group = view.groups[0];
    expect(group.conflict).toBe(true);
    expect(group.takes).toHaveLength(2);
    const byAgent = new Map(group.takes.map((t: { agent_id: string; finding: unknown }) => [t.agent_id, t]));
    expect((byAgent.get(agentA.id) as { finding: unknown }).finding).not.toBeNull();
    expect((byAgent.get(agentB.id) as { finding: unknown }).finding).toBeNull();

    // A group id from another PR (or another workspace) 404s.
    const { pr: otherPr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const crossPr = await app.inject({
      method: 'GET',
      url: `/pulls/${otherPr.id}/multi-agent-runs/${multiAgentRunId}`,
    });
    expect(crossPr.statusCode).toBe(404);

    await app.close();
  });

  it('GET /repos/:id/multi-agent-runs/latest resolves the most recent group for the repo', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const noneYet = await app.inject({ method: 'GET', url: `/repos/${repo.id}/multi-agent-runs/latest` });
    expect(noneYet.statusCode).toBe(200);
    expect(noneYet.json()).toBeNull();

    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Latest A', provider: 'openai', model: 'gpt-4.1', system_prompt: 'a' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Latest B', provider: 'openai', model: 'gpt-4.1', system_prompt: 'b' },
      })
    ).json();
    const runRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentIds: [agentA.id, agentB.id] },
    });
    const multiAgentRunId = runRes.json().multi_agent_run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const latest = await app.inject({ method: 'GET', url: `/repos/${repo.id}/multi-agent-runs/latest` });
    expect(latest.json()).toMatchObject({ id: multiAgentRunId, prId: pr.id, prNumber: pr.number });

    await app.close();
  });

  it('GET /agents/estimates: no history renders null, never 0', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Never Run', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    const res = await app.inject({ method: 'GET', url: '/agents/estimates' });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as { agent_id: string; median_duration_ms: number | null; median_cost_usd: number | null }[];
    const mine = rows.find((r) => r.agent_id === agent.id);
    expect(mine).toBeUndefined(); // no `done` run yet — never a fabricated 0 row

    await app.close();
  });
});
