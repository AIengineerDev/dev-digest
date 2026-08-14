/**
 * Timing for the one tool that blocks: `run_agent_on_pr` polls
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

/**
 * Wall-clock budget `run_agent_on_pr` blocks for, in ms.
 *
 * **55s, deliberately under the 60s most hosts allow a single tool call**
 * (the MCP TypeScript SDK's `DEFAULT_REQUEST_TIMEOUT_MSEC`). This used to be
 * 120s, which inverted the whole design: the host killed the call at 60s and
 * DISCARDED the result, so the partial-result path — finished runs plus run
 * ids for `get_findings` — never ran, and the caller got
 * "MCP request timed out" with nothing to follow up on. Our wall has to expire
 * FIRST for that path to mean anything.
 *
 * Raise it only together with the host's own limit (`MCP_TOOL_TIMEOUT`, or the
 * Inspector's Configuration panel); raising it alone brings the old bug back.
 * The review itself is unaffected either way — it runs to completion on the
 * server whether or not a tool call is still attached to it.
 */
export const WAIT_MS = envInt('DEVDIGEST_MCP_WAIT_MS', 55_000);

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
