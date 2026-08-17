/**
 * Operator configuration, validated once at startup.
 *
 * These knobs are env vars and never tool inputs (`../AGENTS.md`, "Token
 * budget"), which means nothing else validates them: a host config is a JSON
 * blob typed by hand, and a typo there used to fall back to the default in
 * silence. That is the worst possible failure for THESE particular vars —
 * `DEVDIGEST_MCP_WAIT_MS` is the one that has already inverted this package's
 * design once (the 120s wall, see `constants.ts`), so an operator who sets it
 * and gets 55s anyway has no way to tell. Bad input therefore stops the process
 * with a message naming the variable, the value and the fix; it never degrades
 * to a default.
 *
 * `loadConfig` is pure and takes the environment as an argument so the tests
 * drive it directly. `constants.ts` is what calls it for real.
 */
import { z } from 'zod';

export const DEFAULT_API_URL = 'http://localhost:3001';

export interface Config {
  /** Where the DevDigest API listens. */
  apiUrl: string;
  /** Wall-clock budget `run_agent_on_pr` blocks for, in ms. */
  waitMs: number;
  /** Interval between `GET /pulls/:id/runs` polls, in ms. */
  pollMs: number;
  /** Per-HTTP-request timeout in `api.ts`, in ms. */
  requestTimeoutMs: number;
}

/**
 * A startup failure the caller is expected to print as-is: the message is
 * already phrased for a person editing a host config, in the same spirit as
 * `ApiError` being phrased for the model.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const MsSchema = z
  .string()
  .regex(/^\d+$/, 'must be a whole number of milliseconds, e.g. 55000')
  .transform(Number)
  .refine((n) => n > 0, 'must be greater than 0')
  .refine(Number.isSafeInteger, 'is too large to be a millisecond budget');

const ApiUrlSchema = z
  .url('must be an absolute URL, e.g. http://localhost:3001')
  .refine((v) => /^https?:\/\//i.test(v), 'must use http:// or https://');

const EnvSchema = z.object({
  DEVDIGEST_API_URL: ApiUrlSchema.optional(),
  DEVDIGEST_MCP_WAIT_MS: MsSchema.optional(),
  DEVDIGEST_MCP_POLL_MS: MsSchema.optional(),
  DEVDIGEST_MCP_REQUEST_TIMEOUT_MS: MsSchema.optional(),
  // The host's own per-call wall. Not ours to enforce — it usually is not even
  // in this process's environment — but when it is, it is worth checking
  // against, because our wall expiring first is the whole design.
  MCP_TOOL_TIMEOUT: MsSchema.optional(),
});

/**
 * An env var set to `""` is a cleared field, not a value. Host configs express
 * "unset" that way all the time (`"env": { "DEVDIGEST_API_URL": "" }`), and
 * failing on it would be pedantry, not a caught mistake.
 */
function present(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    const raw = env[key]?.trim();
    if (raw) out[key] = raw;
  }
  return out;
}

export interface LoadOptions {
  /** Where advisory (non-fatal) messages go. `index.ts` sends them to stderr. */
  onWarn?: (message: string) => void;
}

/** Throws `ConfigError` — with every problem in one message — on bad input. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, opts: LoadOptions = {}): Config {
  const raw = present(env);
  const parsed = EnvSchema.safeParse(raw);

  if (!parsed.success) {
    // One message listing every bad var, not one failure per run: fixing a host
    // config is a round trip through restarting the server, so a caller who set
    // two knobs wrongly should learn both the first time.
    const lines = parsed.error.issues.map((issue) => {
      const name = String(issue.path[0]);
      return `  ${name}=${JSON.stringify(raw[name])} — ${issue.message}`;
    });
    throw new ConfigError(
      `Invalid environment:\n${lines.join('\n')}\n` +
        `Fix it in the host's \`env\` block (see mcp/README.md, "Environment"), or unset it to take the default.`,
    );
  }

  const config: Config = {
    apiUrl: parsed.data.DEVDIGEST_API_URL ?? DEFAULT_API_URL,
    waitMs: parsed.data.DEVDIGEST_MCP_WAIT_MS ?? 55_000,
    pollMs: parsed.data.DEVDIGEST_MCP_POLL_MS ?? 2_000,
    requestTimeoutMs: parsed.data.DEVDIGEST_MCP_REQUEST_TIMEOUT_MS ?? 15_000,
  };

  // A poll interval at or above the wall means the loop returns a partial
  // result having never asked the API anything — the tool would look like it
  // waited and found nothing, which is indistinguishable from a review that
  // produced nothing.
  if (config.pollMs >= config.waitMs) {
    throw new ConfigError(
      `DEVDIGEST_MCP_POLL_MS (${config.pollMs}) must be smaller than DEVDIGEST_MCP_WAIT_MS (${config.waitMs}): ` +
        `at that interval run_agent_on_pr would hit its wall before polling once.`,
    );
  }

  // Advisory, not fatal: the variable belongs to the host, so its absence here
  // means nothing, and a mismatch is only a strong hint that the call will be
  // cut before our partial-result path can run (`../AGENTS.md`).
  const hostWall = parsed.data.MCP_TOOL_TIMEOUT;
  if (hostWall !== undefined && config.waitMs >= hostWall) {
    opts.onWarn?.(
      `DEVDIGEST_MCP_WAIT_MS (${config.waitMs}) is not under MCP_TOOL_TIMEOUT (${hostWall}). ` +
        `The host will cut the call before run_agent_on_pr can return its partial result; ` +
        `the runs still finish server-side and get_findings collects them.`,
    );
  }

  return config;
}
