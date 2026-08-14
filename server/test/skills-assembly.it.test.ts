import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import * as t from '../src/db/schema.js';
import type { Review, RunTrace, SkillRef } from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';

/**
 * Phase 3 of `specs/02-skills.md` — the wire from `agent_skills` to the review
 * prompt's `## Skills / rules` block.
 *
 * Every assertion here reads the PERSISTED run trace (`prompt_assembly.skills`
 * and the run log), not the assembler: what matters is what reached the model,
 * and a test that asserted on the resolver would keep passing if the executor
 * stopped passing the result to the engine.
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

d('skills → prompt assembly (Testcontainers pg)', () => {
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

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  async function setupRepoAndPr() {
    const name = `skills-repo-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900 + seq,
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
    return { repo: repo!, pr: pr! };
  }

  type App = Awaited<ReturnType<typeof appWith>>;

  async function createSkill(app: App, name: string, body: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `${name}-${seq++}`, description: name, type: 'convention', body },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string; version: number };
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
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function setSkills(app: App, agentId: string, skillIds: string[]) {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: skillIds },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as { skill_id: string; order: number }[];
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

  it('assembles the agent\'s linked skill bodies into the prompt, in link order', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr();
    const first = await createSkill(app, 'first', 'RULE ONE: always name the limit.');
    const second = await createSkill(app, 'second', 'RULE TWO: never truncate a rule.');
    const agent = await createAgent(app, 'Skilled');
    await setSkills(app, agent.id, [first.id, second.id]);

    const trace = await runAndTrace(app, pr.id, agent.id);

    expect(trace.prompt_assembly.skills).not.toBeNull();
    const block = trace.prompt_assembly.skills!;
    expect(block).toContain('RULE ONE: always name the limit.');
    expect(block).toContain('RULE TWO: never truncate a rule.');
    expect(block.indexOf('RULE ONE')).toBeLessThan(block.indexOf('RULE TWO'));
    // …and the block really is in the user message under its heading.
    expect(trace.prompt_assembly.user).toContain('## Skills / rules');
    expect(trace.prompt_assembly.user).toContain('RULE TWO: never truncate a rule.');

    // Acceptance criterion 4's second clause: the slot carries its own token
    // count, and it survives the round trip through the persisted trace. The
    // hermetic test in `prompt-log.test.ts` pins the counting; this pins the
    // wiring, which is the half that a refactor of the executor would break.
    expect(trace.prompt_assembly.skills_tokens).toBeGreaterThan(0);

    await app.close();
  });

  it('reordering the links reverses the order of the blocks in the prompt', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr();
    const a = await createSkill(app, 'alpha', 'RULE ONE: always name the limit.');
    const b = await createSkill(app, 'beta', 'RULE TWO: never truncate a rule.');
    const agent = await createAgent(app, 'Reordered');

    await setSkills(app, agent.id, [a.id, b.id]);
    const before = await runAndTrace(app, pr.id, agent.id);
    expect(before.prompt_assembly.skills!.indexOf('RULE ONE')).toBeLessThan(
      before.prompt_assembly.skills!.indexOf('RULE TWO'),
    );

    await setSkills(app, agent.id, [b.id, a.id]);
    // A second PR so `waitForPrRuns` sees exactly this run.
    const { pr: pr2 } = await setupRepoAndPr();
    const after = await runAndTrace(app, pr2.id, agent.id);
    expect(after.prompt_assembly.skills!.indexOf('RULE TWO')).toBeLessThan(
      after.prompt_assembly.skills!.indexOf('RULE ONE'),
    );

    await app.close();
  });

  it('a globally disabled skill leaves the prompt but keeps its link', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr();
    const kept = await createSkill(app, 'kept', 'RULE KEPT: this one stays.');
    const off = await createSkill(app, 'off', 'RULE OFF: this one is switched off.');
    const agent = await createAgent(app, 'Toggler');
    await setSkills(app, agent.id, [kept.id, off.id]);

    const before = await runAndTrace(app, pr.id, agent.id);
    expect(before.prompt_assembly.skills).toContain('RULE OFF: this one is switched off.');

    const disabled = await app.inject({
      method: 'PUT',
      url: `/skills/${off.id}`,
      payload: { enabled: false },
    });
    expect(disabled.statusCode).toBe(200);

    const { pr: pr2 } = await setupRepoAndPr();
    const after = await runAndTrace(app, pr2.id, agent.id);
    expect(after.prompt_assembly.skills).toContain('RULE KEPT: this one stays.');
    expect(after.prompt_assembly.skills).not.toContain('RULE OFF: this one is switched off.');
    expect(after.log.some((l) => l.msg.includes('globally disabled'))).toBe(true);

    // The link survives the toggle — re-enabling brings the rule back.
    const links = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })
    ).json() as { skill_id: string }[];
    expect(links.map((l) => l.skill_id)).toContain(off.id);

    await app.inject({ method: 'PUT', url: `/skills/${off.id}`, payload: { enabled: true } });
    const { pr: pr3 } = await setupRepoAndPr();
    const reenabled = await runAndTrace(app, pr3.id, agent.id);
    expect(reenabled.prompt_assembly.skills).toContain('RULE OFF: this one is switched off.');

    await app.close();
  });

  it('an over-budget assembly drops the tail and says so in the trace', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr();
    // 4 × 7 000 characters = 28 000 > the 24 000-character block budget, so the
    // first three fit and the fourth is dropped whole. The bodies are not sized
    // to fill the budget exactly on purpose: each block also carries its
    // `**skill: name@version**` label, which counts against the budget, so an
    // exact fit would make this test a measurement of the label's length.
    const bodies = ['ONE', 'TWO', 'THREE', 'TAIL'].map(
      (tag) => `RULE ${tag}: ` + 'x'.repeat(7000 - `RULE ${tag}: `.length),
    );
    const skills = [];
    for (const [i, body] of bodies.entries()) skills.push(await createSkill(app, `big-${i}`, body));
    const agent = await createAgent(app, 'Overflowing');
    await setSkills(app, agent.id, skills.map((s) => s.id));

    const trace = await runAndTrace(app, pr.id, agent.id);
    const block = trace.prompt_assembly.skills!;

    expect(block).toContain('RULE ONE:');
    expect(block).toContain('RULE THREE:');
    expect(block).not.toContain('RULE TAIL:');
    expect(block.length).toBeLessThanOrEqual(24000 + 2 * 2); // + the "\n\n" joins
    // Each surviving body is attributable to the skill it came from.
    for (const skill of skills.slice(0, 3)) {
      expect(block).toContain(`**skill: ${skill.name}@1**`);
    }
    // The loss is recorded, not silent.
    const dropNote = trace.log.find((l) => l.msg.includes('dropped from the end of the order'));
    expect(dropNote).toBeDefined();
    expect(dropNote!.msg).toContain('24000');
    expect(dropNote!.msg).toContain(skills[3]!.name);

    await app.close();
  });

  it('a replay of a pinned agent version uses the pinned body, not the current one', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr();
    const skill = await createSkill(app, 'pinned', 'RULE V1: the original wording.');
    const agent = await createAgent(app, 'Replayed');
    await setSkills(app, agent.id, [skill.id]);
    // Bump the agent so a version snapshot is taken WITH the link in place.
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}`,
      payload: { system_prompt: 'You are a reviewer. v2' },
    });
    const versions = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })
    ).json() as { version: number; config: unknown }[];
    const pinned = AgentVersionConfig.parse(versions[0]!.config).skills as SkillRef[];
    expect(pinned).toEqual([{ id: skill.id, version: 1 }]);

    // Now edit the body: the live path would use v2, the replay must not.
    const bumped = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'RULE V2: the rewritten wording.' },
    });
    expect(bumped.json().version).toBe(2);

    const live = await runAndTrace(app, pr.id, agent.id);
    expect(live.prompt_assembly.skills).toContain('RULE V2: the rewritten wording.');

    // Replay: drive the executor with the pinned refs from the snapshot.
    const { pr: pr2, repo } = await setupRepoAndPr();
    const [agentRow] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.id, agent.id));
    const [pullRow] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.id, pr2.id));
    const runId = await app.container.reviewRepo.createAgentRun({
      workspaceId,
      agentId: agent.id,
      prId: pr2.id,
      provider: agentRow!.provider,
      model: agentRow!.model,
      headSha: pullRow!.headSha,
    });
    const executor = new ReviewRunExecutor(
      app.container,
      app.container.reviewRepo,
      app.container.agentsRepo,
    );
    await executor.executeRuns(workspaceId, pullRow!, repo, [
      { agent: agentRow!, runId, pinnedSkills: pinned },
    ]);

    const replay = (
      await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })
    ).json() as RunTrace;
    expect(replay.prompt_assembly.skills).toContain('RULE V1: the original wording.');
    expect(replay.prompt_assembly.skills).not.toContain('RULE V2: the rewritten wording.');

    await app.close();
  });

  it('a pinned skill that no longer exists is omitted and noted, not fatal', async () => {
    const app = await appWith();
    const { pr, repo } = await setupRepoAndPr();
    const gone = await createSkill(app, 'doomed', 'RULE GONE: deleted before the replay.');
    const agent = await createAgent(app, 'Ghost');
    await setSkills(app, agent.id, [gone.id]);
    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${gone.id}` });
    expect(deleted.statusCode).toBe(200);

    const [agentRow] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id));
    const [pullRow] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.id, pr.id));
    const runId = await app.container.reviewRepo.createAgentRun({
      workspaceId,
      agentId: agent.id,
      prId: pr.id,
      provider: agentRow!.provider,
      model: agentRow!.model,
      headSha: pullRow!.headSha,
    });
    const executor = new ReviewRunExecutor(
      app.container,
      app.container.reviewRepo,
      app.container.agentsRepo,
    );
    await executor.executeRuns(workspaceId, pullRow!, repo, [
      { agent: agentRow!, runId, pinnedSkills: [{ id: gone.id, version: 1 }] },
    ]);

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done'); // the run survives a missing skill
    const trace = (
      await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })
    ).json() as RunTrace;
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.log.some((l) => l.msg.includes('no longer resolve'))).toBe(true);

    await app.close();
  });
});
