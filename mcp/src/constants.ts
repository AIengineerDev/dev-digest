/**
 * Timing for the one tool that blocks: `run_agent_on_pull_request` polls
 * `GET /pulls/:id/runs` instead of returning immediately (see
 * `tools/run-agent.ts`). These are read once at module load and handed to
 * `buildServer()` as defaults — never read from `process.env` deep inside the
 * poll loop — so tests can inject a fast `Timing` with no fake timers.
 *
 * Deliberately NOT tool input parameters: a schema field is paid for in every
 * session (see `../AGENTS.md` "Token budget"), and these are operator/
 * deployment knobs, not something a model should be choosing per call.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Wall-clock budget `run_agent_on_pull_request` blocks for, in ms. */
export const WAIT_MS = envInt('DEVDIGEST_MCP_WAIT_MS', 120_000);

/** Interval between `GET /pulls/:id/runs` polls, in ms. */
export const POLL_MS = envInt('DEVDIGEST_MCP_POLL_MS', 2_000);

/** Per-HTTP-request timeout in `src/api.ts`, in ms. */
export const REQUEST_TIMEOUT_MS = envInt('DEVDIGEST_MCP_REQUEST_TIMEOUT_MS', 15_000);

/** What `run-agent.ts` needs to drive its poll loop; injected via `Deps`. */
export interface Timing {
  waitMs: number;
  pollMs: number;
}

export const DEFAULT_TIMING: Timing = { waitMs: WAIT_MS, pollMs: POLL_MS };
