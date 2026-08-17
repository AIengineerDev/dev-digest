/**
 * DevDigestApi — the only place this package speaks HTTP.
 *
 * One method per endpoint the tools use, no more. Every method returns the
 * server's own contract type, imported with `import type` so nothing from
 * `@devdigest/shared` survives into the emitted JS (see tsconfig.json).
 *
 * The tools depend on this interface, not on `fetch`, which is what lets the
 * tests drive the whole server with a plain object and no network.
 */
import type {
  Agent,
  BlastRadius,
  Convention,
  PrMeta,
  Repo,
  ReviewRecord,
  RunSummary,
} from '@devdigest/shared';
import { API_URL, REQUEST_TIMEOUT_MS } from './constants.js';

export { DEFAULT_API_URL } from './config.js';

/** One run started by `POST /pulls/:id/review` (ReviewRunTarget). */
export interface RunTarget {
  run_id: string;
  agent_id: string;
  agent_name: string;
}

export interface DevDigestApi {
  listRepos(): Promise<Repo[]>;
  listPulls(repoId: string): Promise<PrMeta[]>;
  listAgents(): Promise<Agent[]>;
  startReview(prId: string, target: { agentId: string } | { all: true }): Promise<RunTarget[]>;
  // `signal` composes with the tool's own cancellation (`ctx.mcpReq.signal`):
  // the poll loop in `tools/run-agent.ts` calls these on every tick, and a
  // hung connection must not silently eat the whole wait budget.
  listRuns(prId: string, signal?: AbortSignal): Promise<RunSummary[]>;
  listReviews(prId: string, signal?: AbortSignal): Promise<ReviewRecord[]>;
  listConventions(repoId: string, status?: string): Promise<Convention[]>;
  getBlastRadius(prId: string): Promise<BlastRadius>;
}

/**
 * An API call that failed. `message` is already phrased for the model — the
 * tool layer hands it straight back as an `isError` result rather than
 * translating it again.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The server's structured envelope: `{ error: { code, message, details } }`. */
function messageFromBody(body: unknown, fallback: string): string {
  const err = (body as { error?: { message?: unknown; code?: unknown } } | null)?.error;
  if (err && typeof err.message === 'string') {
    return typeof err.code === 'string' ? `${err.code}: ${err.message}` : err.message;
  }
  return fallback;
}

// `DEVDIGEST_API_URL` is read in `config.ts`, not here: an unparseable URL has
// to fail at startup, where it is one message, rather than on the first tool
// call, where it is a fetch error the model then tries to work around.
export function createApi(baseUrl = API_URL): DevDigestApi {
  const root = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
    // A hung connection must not silently eat the caller's whole budget: with
    // run_agent_on_pr polling every couple of seconds for up to two
    // minutes, a stuck fetch here is load-bearing, not a nicety.
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const composedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let res: Response;
    try {
      res = await fetch(`${root}${path}`, {
        ...init,
        signal: composedSignal,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
    } catch (cause) {
      if (timeoutSignal.aborted && !signal?.aborted) {
        throw new ApiError(`Request to ${root}${path} timed out after ${REQUEST_TIMEOUT_MS}ms.`);
      }
      if (signal?.aborted) {
        // Caller cancelled (e.g. the MCP host cancelled the tool call) — let
        // the original abort propagate rather than relabeling it.
        throw cause;
      }
      // Overwhelmingly the case in practice: the API simply isn't running. Say
      // so, and say how to fix it — a bare ECONNREFUSED sends the model guessing.
      throw new ApiError(
        `Cannot reach the DevDigest API at ${root} (${(cause as Error).message}). ` +
          `Start it with \`./scripts/dev.sh\`, or set DEVDIGEST_API_URL if it listens elsewhere.`,
      );
    }
    const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 429) {
        throw new ApiError(
          `Rate limited: POST /pulls/:id/review allows 10 requests per minute. Wait a minute before starting another review.`,
          429,
        );
      }
      throw new ApiError(messageFromBody(body, `${res.status} ${res.statusText}`), res.status);
    }
    return body as T;
  }

  return {
    listRepos: () => request<Repo[]>('/repos'),
    listPulls: (repoId) => request<PrMeta[]>(`/repos/${repoId}/pulls`),
    listAgents: () => request<Agent[]>('/agents'),
    startReview: async (prId, target) => {
      const body = await request<{ runs: RunTarget[] }>(`/pulls/${prId}/review`, {
        method: 'POST',
        body: JSON.stringify(target),
      });
      return body.runs;
    },
    listRuns: (prId, signal) => request<RunSummary[]>(`/pulls/${prId}/runs`, undefined, signal),
    listReviews: (prId, signal) => request<ReviewRecord[]>(`/pulls/${prId}/reviews`, undefined, signal),
    listConventions: (repoId, status) =>
      request<Convention[]>(
        `/repos/${repoId}/conventions${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      ),
    getBlastRadius: (prId) => request<BlastRadius>(`/pulls/${prId}/blast`),
  };
}
