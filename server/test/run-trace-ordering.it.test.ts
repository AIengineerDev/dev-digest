/**
 * A run marked `done` must already have its trace.
 *
 * Every consumer polls `agent_runs` for a terminal status and then fetches the
 * trace: the PR page's run history opens `RunTraceDrawer` that way, and the
 * integration suite's `runAndTrace` helper does the same. The executor used to
 * write `status: 'done'` first and the `run_traces` row after, leaving a window
 * where the run looked complete and the trace did not exist. It surfaced on CI
 * as `Cannot read properties of undefined (reading 'skills')` — a null-ish
 * error a long way from its cause.
 *
 * This pins the ordering at the only place it is observable from outside: the
 * moment the status becomes terminal, the trace must be queryable.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockEmbedder, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

// A diff and a finding that cites a line inside it, so the run reaches `done`
// rather than failing on an empty diff — the grounding gate drops uncited findings.
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW = {
  verdict: 'request_changes',
  summary: 'ordering fixture',
  score: 42,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'Secret in source.',
      suggestion: null,
      confidence: 0.9,
    },
  ],
};

d('run trace ordering (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('has the trace persisted by the time the run reports a terminal status', async () => {
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW }) },
      },
    });

    const [pr] = await pg.handle.db.select().from(t.pullRequests);
    // Seeded agents default to openrouter (db/seed.ts DEFAULT_PROVIDER), which
    // has no key here; point one at the provider this test actually mocks.
    const [agent] = await pg.handle.db
      .update(t.agents)
      .set({ provider: 'openai', model: 'gpt-4o-mini' })
      .where(eq(t.agents.name, 'General Reviewer'))
      .returning();

    const started = (
      await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent!.id } })
    ).json();
    const runId: string = started.runs[0].run_id;

    // Poll exactly the way a consumer does, and check the trace on the FIRST
    // tick that reports terminal — not after a settling delay, which would hide
    // the very window this test exists for.
    const TERMINAL = new Set(['done', 'failed', 'cancelled']);
    const deadline = Date.now() + 30_000;
    let status: string | null = null;
    for (;;) {
      const [row] = await pg.handle.db
        .select()
        .from(t.agentRuns)
        .where(eq(t.agentRuns.id, runId));
      status = row?.status ?? null;
      if (status && TERMINAL.has(status)) break;
      if (Date.now() > deadline) throw new Error(`run ${runId} never settled; last status ${status}`);
      await new Promise((r) => setTimeout(r, 10));
    }

    if (status !== 'done') {
      const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
      throw new Error(`run did not finish cleanly: ${status} — ${row?.error}`);
    }

    const [traceRow] = await pg.handle.db
      .select()
      .from(t.runTraces)
      .where(eq(t.runTraces.runId, runId));
    expect(traceRow, 'run reported done with no trace row').toBeDefined();

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    expect(res.statusCode).toBe(200);
    expect(res.json().prompt_assembly).toBeDefined();
  });
});
