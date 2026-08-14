import * as t from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PgFixture } from './pg.js';

/**
 * `runReview` is fire-and-forget: the POST returns runIds immediately and each
 * agent's review is persisted in the background (the client subscribes to SSE).
 * Tests that assert on persisted reviews/findings/traces must first wait for the
 * background runs to finish. This polls `agent_runs` until every row for the PR
 * reaches a terminal status (done / failed / cancelled).
 */
const TERMINAL = new Set(['done', 'failed', 'cancelled']);

export async function waitForPrRuns(
  db: PgFixture['handle']['db'],
  prId: string,
  opts: { expected?: number; timeoutMs?: number } = {},
): Promise<Array<typeof t.agentRuns.$inferSelect>> {
  // 30s, not 10: a CI runner is several times slower than a dev machine, and
  // every caller here waits on a real review run (mock LLM, but real DB writes
  // and a real job loop). At 10s this timed out only on CI, where it surfaced
  // as `expected 'running' to be 'done'` — see the throw below.
  const { expected, timeoutMs = 30_000 } = opts;
  const start = Date.now();
  for (;;) {
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const terminal = runs.filter((r) => TERMINAL.has(r.status ?? ''));
    // With an explicit `expected`, wait until that many runs finish (ignores any
    // extra rows, e.g. a trifecta scan). Otherwise wait for all rows to settle.
    const done =
      expected != null
        ? terminal.length >= expected
        : runs.length > 0 && terminal.length === runs.length;
    if (done) return runs;
    // Throw rather than return a half-settled list. Returning let the caller's
    // next assertion fail as `expected 'running' to be 'done'`, which reads as
    // "the run produced the wrong status" when it actually means "we stopped
    // waiting" — two different bugs that took a CI round-trip to tell apart.
    if (Date.now() - start > timeoutMs) {
      const seen = runs.map((r) => `${r.id}:${r.status ?? 'null'}`).join(', ') || '(no rows)';
      throw new Error(
        `waitForPrRuns timed out after ${timeoutMs}ms waiting for ` +
          `${expected ?? 'all'} run(s) on pr ${prId} to reach a terminal status. Saw: ${seen}`,
      );
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
