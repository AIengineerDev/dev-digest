/**
 * Timing for the one tool that blocks: `run_agent_on_pr` polls
 * `GET /pulls/:id/runs` instead of returning immediately (see
 * `tools/run-agent.ts`). These are read once at module load and handed to
 * `buildServer()` as defaults — never read from `process.env` deep inside the
 * poll loop — so tests can inject a fast `Timing` with no fake timers.
 *
 * Deliberately NOT tool input parameters: a schema field is paid for in every
 * session (see `../AGENTS.md` "Token budget"), and these are operator/
 * deployment knobs, not something a model should be choosing per call. Their
 * values are validated in `config.ts`, which is what makes env safe as the only
 * place they can be set.
 */
import { loadConfig } from './config.js';

/**
 * Bad env stops the process rather than falling back — `index.ts` calls
 * `loadConfig` first so the operator sees the message instead of an import
 * stack. Reaching it from here would mean the module graph was loaded some
 * other way (a test, `buildServer()` imported directly); the throw is still the
 * right outcome, just uglier.
 */
const CONFIG = loadConfig();

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
 * Inspector's Configuration panel); raising it alone brings the old bug back,
 * and `config.ts` warns when it can see both. The review itself is unaffected
 * either way — it runs to completion on the server whether or not a tool call
 * is still attached to it.
 */
export const WAIT_MS = CONFIG.waitMs;

/** Interval between `GET /pulls/:id/runs` polls, in ms. */
export const POLL_MS = CONFIG.pollMs;

/** Per-HTTP-request timeout in `src/api.ts`, in ms. */
export const REQUEST_TIMEOUT_MS = CONFIG.requestTimeoutMs;

/** Where the DevDigest API listens; `api.ts` uses it as its default base URL. */
export const API_URL = CONFIG.apiUrl;

/** What `run-agent.ts` needs to drive its poll loop; injected via `Deps`. */
export interface Timing {
  waitMs: number;
  pollMs: number;
}

export const DEFAULT_TIMING: Timing = { waitMs: WAIT_MS, pollMs: POLL_MS };
