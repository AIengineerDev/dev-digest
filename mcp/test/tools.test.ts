/**
 * The whole server, driven through a real MCP `Client` in-process — the SDK's
 * own testing shape (docs/testing.md). Nothing is mocked except `DevDigestApi`,
 * so schema validation, argument parsing and the `isError` envelope are all the
 * real thing.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type {
  Agent,
  BlastRadius,
  Convention,
  PrMeta,
  Repo,
  ReviewRecord,
  RunSummary,
} from '@devdigest/shared';
import type { DevDigestApi, RunTarget } from '../src/api.js';
import { WAIT_MS, type Timing } from '../src/constants.js';
import { buildServer } from '../src/server.js';

// Every test drives the run_agent_on_pr poll loop through this
// timing, not the production defaults (55s wait / 2s poll) — fast enough
// that no test needs fake timers around it.
const FAST_TIMING: Timing = { waitMs: 200, pollMs: 5 };

// ---- fixtures -------------------------------------------------------------

const REPO = { id: 'repo-1', full_name: 'acme/payments-api', name: 'payments-api' } as Repo;
const PULL = { id: 'pr-1', number: 482 } as PrMeta;

const agent = (over: Partial<Agent>): Agent =>
  ({
    id: 'a1',
    name: 'General',
    description: '',
    provider: 'anthropic',
    model: 'claude-opus-5',
    system_prompt: 'SECRET_PROMPT_MARKER — pretend this is several kilobytes.',
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    ...over,
  }) as Agent;

const run = (over: Partial<RunSummary>): RunSummary =>
  ({
    run_id: 'run-1',
    agent_id: 'a1',
    agent_name: 'General',
    provider: 'anthropic',
    model: 'claude-opus-5',
    status: 'done',
    error: null,
    duration_ms: 1000,
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: 0.01,
    findings_count: 0,
    grounding: null,
    ran_at: '2026-08-11T00:00:00Z',
    score: 80,
    blockers: 0,
    head_sha: 'sha-new',
    ...over,
  }) as RunSummary;

const finding = (i: number, severity = 'WARNING') => ({
  id: `f${i}`,
  review_id: 'rev-1',
  severity,
  category: 'bug',
  title: `Problem ${i}`,
  file: 'src/a.ts',
  start_line: i,
  end_line: i,
  rationale: `Because of reason ${i}`,
  suggestion: null,
  confidence: 0.9,
  accepted_at: null,
  dismissed_at: null,
});

const review = (over: Partial<ReviewRecord>): ReviewRecord =>
  ({
    id: 'rev-1',
    pr_id: 'pr-1',
    agent_id: 'a1',
    run_id: 'run-1',
    agent_name: 'General',
    head_sha: 'sha-new',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'Two issues.',
    score: 80,
    model: 'claude-opus-5',
    created_at: '2026-08-11T00:00:00Z',
    findings: [],
    ...over,
  }) as ReviewRecord;

const convention = (over: Partial<Convention>): Convention =>
  ({
    id: 'c1',
    repo_id: 'repo-1',
    category: 'naming',
    rule: 'Services end in Service',
    rationale: 'Consistency',
    evidence_path: 'src/x.ts',
    evidence_line: 3,
    evidence_snippet: 'class FooService {}',
    confidence: 0.9,
    status: 'accepted',
    head_sha: null,
    created_at: '2026-08-11T00:00:00Z',
    ...over,
  }) as Convention;

const EMPTY_BLAST: BlastRadius = {
  changed_symbols: [],
  downstream: [],
  summary: 'No changed files recorded for this PR — open it once to import its diff.',
};

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' },
    { name: 'bucketKey', file: 'src/middleware/ratelimit.ts', kind: 'function' },
  ],
  downstream: [
    {
      symbol: 'rateLimit',
      callers: [{ name: 'boot', file: 'src/server.ts', line: 40 }],
      endpoints_affected: ['POST /webhooks'],
      crons_affected: ['nightly-sweep'],
    },
    { symbol: 'bucketKey', callers: [], endpoints_affected: [], crons_affected: [] },
  ],
  summary: '2 changed symbols · 1 caller · 1 endpoint.',
};

// ---- harness --------------------------------------------------------------

interface Stub extends DevDigestApi {
  started: { prId: string; target: { agentId: string } | { all: true } }[];
}

function stubApi(over: Partial<DevDigestApi> = {}): Stub {
  const started: Stub['started'] = [];
  return {
    started,
    listRepos: async () => [REPO],
    listPulls: async () => [PULL],
    listAgents: async () => [agent({})],
    startReview: async (prId, target) => {
      started.push({ prId, target });
      return [{ run_id: 'run-1', agent_id: 'a1', agent_name: 'General' }] as RunTarget[];
    },
    listRuns: async () => [],
    listReviews: async () => [],
    listConventions: async () => [],
    getBlastRadius: async () => EMPTY_BLAST,
    ...over,
  } as Stub;
}

async function connect(api: DevDigestApi, timing: Timing = FAST_TIMING): Promise<Client> {
  const handler = createMcpHandler(() => buildServer(api, timing));
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client({ name: 'test', version: '0' }, { versionNegotiation: { mode: 'auto' } });
  await client.connect(transport);
  return client;
}

const textOf = (result: { content: unknown }): string =>
  (result.content as { type: string; text?: string }[])
    .map((c) => c.text ?? '')
    .join('\n');

// ---- tests ----------------------------------------------------------------

describe('tool surface', () => {
  let client: Client;
  beforeEach(async () => {
    client = await connect(stubApi());
  });

  it('advertises exactly the five tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['get_blast_radius', 'get_conventions', 'get_findings', 'list_agents', 'run_agent_on_pr'].sort(),
    );
  });

  /**
   * The session-start budget. Everything advertised here is pasted into the
   * context window of every new chat before the user types a word, so this is
   * the one number that has to stay small as tools are added. ~4 chars/token,
   * so 4000 chars ≈ the 900-token target in specs/06-mcp-server.md.
   */
  it('keeps the whole tools/list payload under the token budget', async () => {
    const listed = await client.listTools();
    const len = JSON.stringify(listed).length;
    expect(len, `tools/list = ${len}`).toBeLessThan(4000);
  });

  /**
   * A union renders as `anyOf` in the JSON Schema, and a host with no widget for
   * that falls back to a raw JSON editor. In the MCP Inspector that editor
   * re-encodes the value on every keystroke: quotes accumulate backslashes and
   * Backspace appears to do nothing, which makes the tool unusable by hand.
   * `pr` was `z.union([number, string])` and hit exactly that.
   */
  it('keeps every input property a single JSON Schema type, never anyOf', async () => {
    const { tools } = await client.listTools();
    const unions: string[] = [];
    for (const t of tools) {
      for (const [name, schema] of Object.entries(t.inputSchema.properties ?? {})) {
        const s = schema as Record<string, unknown>;
        if (s.anyOf || s.oneOf) unions.push(`${t.name}.${name}`);
      }
    }
    expect(unions).toEqual([]);
  });

  /**
   * `outputSchema` is advertised in `tools/list` and would roughly double the
   * static session cost; these results are read by a model, not a program.
   * specs/06-mcp-server.md:107-109.
   */
  it('advertises no outputSchema', async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.outputSchema, t.name).toBeUndefined();
    }
  });

  /**
   * `DEVDIGEST_MCP_WAIT_MS` / `_POLL_MS` / `_REQUEST_TIMEOUT_MS` are operator
   * knobs and must never become tool input parameters — mcp/AGENTS.md:124-128.
   */
  it('keeps operator knobs out of the tool schemas', async () => {
    const { tools } = await client.listTools();
    const offenders: string[] = [];
    for (const t of tools) {
      for (const name of Object.keys(t.inputSchema.properties ?? {})) {
        if (/wait|poll|timeout|_ms$/i.test(name)) offenders.push(`${t.name}.${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('marks the four read tools read-only and the run tool not', async () => {
    const { tools } = await client.listTools();
    const readOnly = Object.fromEntries(tools.map((t) => [t.name, t.annotations?.readOnlyHint]));
    expect(readOnly).toEqual({
      list_agents: true,
      get_findings: true,
      get_conventions: true,
      get_blast_radius: true,
      run_agent_on_pr: false,
    });
  });

  /**
   * The wall must expire before the MCP TypeScript SDK client's own
   * DEFAULT_REQUEST_TIMEOUT_MSEC (60s), or the host kills the call and
   * discards the whole result before the partial-result path can run. It was
   * 120s once — the host's 60s default fired first — see constants.ts:20-36.
   * `constants.ts` reads env at module load, so a developer's local override
   * must not turn this red.
   */
  it.skipIf(process.env.DEVDIGEST_MCP_WAIT_MS !== undefined)(
    'waits less than the host default of 60s',
    () => {
      expect(WAIT_MS).toBeLessThan(60_000);
    },
  );

  it('rejects arguments the schema forbids without reaching the handler', async () => {
    const result = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/payments-api', pr: '482', limit: 999 },
    });
    expect(result.isError).toBe(true);
  });
});

describe('list_agents', () => {
  it('never leaks system_prompt, and hides disabled agents by default', async () => {
    const client = await connect(
      stubApi({
        listAgents: async () => [agent({}), agent({ id: 'a2', name: 'Security', enabled: false })],
      }),
    );
    const out = textOf(await client.callTool({ name: 'list_agents', arguments: {} }));
    expect(out).not.toContain('SECRET_PROMPT_MARKER');
    expect(out).toContain('General');
    expect(out).not.toContain('Security');

    const all = textOf(
      await client.callTool({ name: 'list_agents', arguments: { include_disabled: true } }),
    );
    expect(all).toContain('Security');
    expect(all).toContain('disabled');
  });
});

describe('run_agent_on_pr', () => {
  it('resolves owner/repo + number to a pr id and starts the review', async () => {
    // The default stub never reports the started run as finished, so this
    // exercises the wall-reached path — see the dedicated tests below for
    // "finishes before the wall" and "the wall is reached" in detail.
    const api = stubApi();
    const client = await connect(api);
    const out = textOf(
      await client.callTool({
        name: 'run_agent_on_pr',
        arguments: { repo: 'acme/payments-api', pr: '482' },
      }),
    );
    expect(api.started).toEqual([{ prId: 'pr-1', target: { all: true } }]);
    expect(out).toContain('run-1');
    expect(out).toContain('get_findings');
  });

  it('targets one agent by name', async () => {
    const api = stubApi();
    const client = await connect(api);
    await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/payments-api', pr: '482', agent: 'general' },
    });
    expect(api.started[0]?.target).toEqual({ agentId: 'a1' });
  });

  it('names the agents that do exist when the requested one does not', async () => {
    const client = await connect(stubApi());
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/payments-api', pr: '482', agent: 'Nope' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('General');
  });

  it('names the repos that are imported when the requested one is not', async () => {
    const client = await connect(stubApi());
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'other/thing', pr: '1' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('acme/payments-api');
  });

  it('polls until the run finishes and returns the findings inline', async () => {
    let calls = 0;
    const api = stubApi({
      listRuns: async () => {
        calls += 1;
        return [run({ status: calls < 3 ? 'running' : 'done' })];
      },
      listReviews: async () => [review({ findings: [finding(1, 'CRITICAL')] as never })],
    });
    const client = await connect(api);
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/payments-api', pr: '482' },
    });
    const out = textOf(result);
    expect(result.isError).toBeUndefined();
    expect(out).toContain('request_changes');
    expect(out).toContain('Problem 1');
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('returns a partial result — not an error — when the wait wall is reached', async () => {
    const api = stubApi({
      startReview: async () =>
        [
          { run_id: 'run-1', agent_id: 'a1', agent_name: 'General' },
          { run_id: 'run-2', agent_id: 'a2', agent_name: 'Security' },
        ] as RunTarget[],
      // run-1 finishes; run-2 never appears in listRuns, so it never leaves
      // "running" from this tool's point of view.
      listRuns: async () => [run({ run_id: 'run-1', status: 'done' })],
      listReviews: async () => [review({ run_id: 'run-1', findings: [] as never })],
    });
    const client = await connect(api, { waitMs: 100, pollMs: 5 });
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/payments-api', pr: '482' },
    });
    const out = textOf(result);
    expect(result.isError).toBeUndefined();
    expect(out).toContain('request_changes'); // run-1's finished review
    expect(out).toContain('run-2'); // the still-running id
    expect(out).toContain('get_findings'); // where to collect it
  });

  it('leads the partial result with a count, not a wall of uuids', async () => {
    // A bare id list under "still running" reads as a failure; "0 of 2
    // finished ... this is not an error" reads as the progress it is.
    const client = await connect(
      stubApi({
        startReview: async () =>
          [
            { run_id: 'run-1', agent_id: 'a1', agent_name: 'General' },
            { run_id: 'run-2', agent_id: 'a2', agent_name: 'Security' },
          ] as RunTarget[],
        listRuns: async () => [],
      }),
    );
    const out = textOf(
      await client.callTool({ name: 'run_agent_on_pr', arguments: { repo: 'acme/payments-api', pr: '482' } }),
    );
    expect(out.split('\n')[0]).toContain('0 of 2 reviewers finished');
    expect(out).toContain('not an error');
    expect(out).toContain('get_findings');
    // Fanned out with no `agent`, so it says how to avoid the wait next time.
    expect(out).toContain('pass `agent`');
  });

  it('omits the fan-out hint when the caller already named one agent', async () => {
    const client = await connect(
      stubApi({
        startReview: async () => [{ run_id: 'run-1', agent_id: 'a1', agent_name: 'General' }] as RunTarget[],
        listRuns: async () => [],
      }),
    );
    const out = textOf(
      await client.callTool({
        name: 'run_agent_on_pr',
        arguments: { repo: 'acme/payments-api', pr: '482', agent: 'General' },
      }),
    );
    expect(out).toContain('0 of 1 reviewer finished');
    expect(out).not.toContain('pass `agent`');
  });

  it('stops polling once the caller aborts the call', async () => {
    let calls = 0;
    const api = stubApi({
      listRuns: async () => {
        calls += 1;
        return [run({ status: 'running' })];
      },
    });
    const client = await connect(api, { waitMs: 5000, pollMs: 10 });
    const controller = new AbortController();
    const pending = client
      .callTool(
        { name: 'run_agent_on_pr', arguments: { repo: 'acme/payments-api', pr: '482' } },
        { signal: controller.signal },
      )
      .catch(() => undefined);

    await new Promise((resolve) => setTimeout(resolve, 40));
    const callsAtAbort = calls;
    controller.abort();
    await pending;

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls).toBeLessThanOrEqual(callsAtAbort + 1);
  });

  it('reports progress only when the caller subscribes to it', async () => {
    let calls = 0;
    const withProgress = stubApi({
      listRuns: async () => {
        calls += 1;
        return [run({ status: calls < 2 ? 'running' : 'done' })];
      },
      listReviews: async () => [review({ findings: [] as never })],
    });
    const client = await connect(withProgress);
    const updates: { progress: number; total?: number }[] = [];
    await client.callTool(
      { name: 'run_agent_on_pr', arguments: { repo: 'acme/payments-api', pr: '482' } },
      { onprogress: (p) => updates.push(p) },
    );
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]?.total).toBe(1);
    expect(updates.every((u) => u.progress >= 0 && u.progress <= 1)).toBe(true);

    // Without onprogress the client never asks for a progress token, so the
    // handler's `progressToken !== undefined` guard means no notification is
    // even attempted — this just confirms the call still completes cleanly.
    const withoutProgress = stubApi({
      listRuns: async () => [run({ status: 'done' })],
      listReviews: async () => [review({ findings: [] as never })],
    });
    const client2 = await connect(withoutProgress);
    const result = await client2.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/payments-api', pr: '482' },
    });
    expect(result.isError).toBeUndefined();
  });
});

describe('get_findings', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => finding(i + 1));

  it('reports a run still in flight instead of an empty result', async () => {
    const client = await connect(
      stubApi({ listRuns: async () => [run({ status: 'running' })], listReviews: async () => [] }),
    );
    const out = textOf(
      await client.callTool({ name: 'get_findings', arguments: { repo: 'acme/payments-api', pr: '482' } }),
    );
    expect(out).toContain('status running');
    expect(out).toContain('Still running');
  });

  it('caps the list and says how many it dropped', async () => {
    const client = await connect(
      stubApi({
        listRuns: async () => [run({})],
        listReviews: async () => [review({ findings: twelve as never })],
      }),
    );
    const out = textOf(
      await client.callTool({
        name: 'get_findings',
        arguments: { repo: 'acme/payments-api', pr: '482', limit: 5 },
      }),
    );
    expect(out).toContain('Problem 5');
    expect(out).not.toContain('Problem 6');
    expect(out).toContain('+7 more');
  });

  it('filters by severity floor', async () => {
    const client = await connect(
      stubApi({
        listRuns: async () => [run({})],
        listReviews: async () => [
          review({ findings: [finding(1, 'SUGGESTION'), finding(2, 'CRITICAL')] as never }),
        ],
      }),
    );
    const out = textOf(
      await client.callTool({
        name: 'get_findings',
        arguments: { repo: 'acme/payments-api', pr: '482', min_severity: 'CRITICAL' },
      }),
    );
    expect(out).toContain('Problem 2');
    expect(out).not.toContain('Problem 1');
  });

  it('omits rationale unless detail is full', async () => {
    const api = stubApi({
      listRuns: async () => [run({})],
      listReviews: async () => [review({ findings: [finding(1)] as never })],
    });
    const client = await connect(api);
    const args = { repo: 'acme/payments-api', pr: '482' };
    expect(textOf(await client.callTool({ name: 'get_findings', arguments: args }))).not.toContain(
      'Because of reason 1',
    );
    expect(
      textOf(await client.callTool({ name: 'get_findings', arguments: { ...args, detail: 'full' } })),
    ).toContain('Because of reason 1');
  });

  /**
   * A fan-out run (`agent` omitted) starts one run per enabled reviewer. Showing
   * only the newest would read as the whole answer, so the default is the whole
   * batch — the runs sharing the newest run's head_sha — and never the previous
   * pass against an older head.
   */
  it('defaults to the whole latest pass, not just the newest run', async () => {
    const client = await connect(
      stubApi({
        listRuns: async () => [
          run({ run_id: 'run-2', agent_id: 'a2', agent_name: 'Security', head_sha: 'sha-new' }),
          run({ run_id: 'run-1', agent_id: 'a1', agent_name: 'General', head_sha: 'sha-new' }),
          run({ run_id: 'run-0', agent_id: 'a1', agent_name: 'General', head_sha: 'sha-old' }),
        ],
      }),
    );
    const out = textOf(
      await client.callTool({ name: 'get_findings', arguments: { repo: 'acme/payments-api', pr: '482' } }),
    );
    expect(out).toContain('run-2');
    expect(out).toContain('run-1');
    expect(out).not.toContain('run-0');
  });

  /**
   * `head_sha` only moves when the PR is pushed to, so re-reviewing the same
   * commit piles pass on pass under one head. Observed live on the seeded PR:
   * 11 runs, up to 3 per agent, all one head — the compact tool's default path
   * returning the package's largest answer, and growing with every re-review.
   */
  it('keeps only the newest run per agent within the latest head', async () => {
    const client = await connect(
      stubApi({
        listRuns: async () => [
          run({ run_id: 'pass3-general', agent_id: 'a1', agent_name: 'General' }),
          run({ run_id: 'pass3-security', agent_id: 'a2', agent_name: 'Security' }),
          run({ run_id: 'pass2-general', agent_id: 'a1', agent_name: 'General' }),
          run({ run_id: 'pass1-general', agent_id: 'a1', agent_name: 'General' }),
          run({ run_id: 'pass1-security', agent_id: 'a2', agent_name: 'Security' }),
        ],
      }),
    );
    const out = textOf(
      await client.callTool({ name: 'get_findings', arguments: { repo: 'acme/payments-api', pr: '482' } }),
    );
    expect(out).toContain('pass3-general');
    expect(out).toContain('pass3-security');
    expect(out).not.toContain('pass2-general');
    expect(out).not.toContain('pass1-general');
    expect(out).not.toContain('pass1-security');
  });

  /** A run whose agent was deleted has a null agent_id — never fold those together. */
  it('does not collapse runs that have no agent id', async () => {
    const client = await connect(
      stubApi({
        listRuns: async () => [
          run({ run_id: 'orphan-b', agent_id: null, agent_name: null }),
          run({ run_id: 'orphan-a', agent_id: null, agent_name: null }),
        ],
      }),
    );
    const out = textOf(
      await client.callTool({ name: 'get_findings', arguments: { repo: 'acme/payments-api', pr: '482' } }),
    );
    expect(out).toContain('orphan-a');
    expect(out).toContain('orphan-b');
  });

  it('tells the caller to start a review when the PR has none', async () => {
    const client = await connect(stubApi({ listRuns: async () => [] }));
    const out = textOf(
      await client.callTool({ name: 'get_findings', arguments: { repo: 'acme/payments-api', pr: '482' } }),
    );
    expect(out).toContain('run_agent_on_pr');
  });

  /**
   * `repo` is legitimately absent when `pr` is a uuid or a pasted URL — the
   * "no review" message must address the PR the way the caller did, not print
   * `undefined#<uuid>`.
   */
  it('addresses a bare pr uuid without a repo, never as "undefined#..."', async () => {
    const client = await connect(stubApi({ listRuns: async () => [] }));
    const out = textOf(
      await client.callTool({
        name: 'get_findings',
        arguments: { pr: 'a23e635c-cb87-4230-8bb8-ff3fa63d1c30' },
      }),
    );
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('#');
    expect(out).toContain('run_agent_on_pr');
  });
});

describe('get_conventions', () => {
  it('defaults to accepted rules and renders the evidence location', async () => {
    let asked: string | undefined;
    const client = await connect(
      stubApi({
        listConventions: async (_repoId, status) => {
          asked = status;
          return [convention({})];
        },
      }),
    );
    const out = textOf(
      await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } }),
    );
    expect(asked).toBe('accepted');
    expect(out).toContain('naming — Services end in Service (src/x.ts:3)');
    expect(out).not.toContain('class FooService');
  });

  it('filters by category', async () => {
    const client = await connect(
      stubApi({
        listConventions: async () => [convention({}), convention({ id: 'c2', category: 'testing', rule: 'Vitest only' })],
      }),
    );
    const out = textOf(
      await client.callTool({
        name: 'get_conventions',
        arguments: { repo: 'acme/payments-api', category: 'testing' },
      }),
    );
    expect(out).toContain('Vitest only');
    expect(out).not.toContain('Services end in Service');
  });
});

describe('get_blast_radius', () => {
  it('takes the PR, not a file list — the server derives the diff', async () => {
    const seen: string[] = [];
    const client = await connect(
      stubApi({
        getBlastRadius: async (prId) => {
          seen.push(prId);
          return BLAST;
        },
      }),
    );
    const out = textOf(
      await client.callTool({
        name: 'get_blast_radius',
        arguments: { repo: 'acme/payments-api', pr: '482' },
      }),
    );
    expect(seen).toEqual(['pr-1']);
    expect(out).toContain('rateLimit');
    expect(out).toContain('POST /webhooks');
  });

  it('leads with the summary, so an empty caller list is never read as "safe"', async () => {
    const client = await connect(stubApi({ getBlastRadius: async () => BLAST }));
    const out = textOf(
      await client.callTool({ name: 'get_blast_radius', arguments: { pr: 'a23e635c-cb87-4230-8bb8-ff3fa63d1c30' } }),
    );
    expect(out.split('\n')[0]).toBe('2 changed symbols · 1 caller · 1 endpoint.');
  });

  it('omits per-caller lines until detail is full', async () => {
    const client = await connect(stubApi({ getBlastRadius: async () => BLAST }));
    const compact = textOf(
      await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/payments-api', pr: '482' } }),
    );
    expect(compact).not.toContain('src/server.ts:40');
    // Endpoints survive compaction: "which routes can break" is the question.
    expect(compact).toContain('POST /webhooks');

    const full = textOf(
      await client.callTool({
        name: 'get_blast_radius',
        arguments: { repo: 'acme/payments-api', pr: '482', detail: 'full' },
      }),
    );
    expect(full).toContain('boot — src/server.ts:40');
    expect(full).toContain('cron: nightly-sweep');
  });

  it('caps the symbol list and says how many it dropped', async () => {
    const many: BlastRadius = {
      ...BLAST,
      downstream: Array.from({ length: 5 }, (_, i) => ({
        symbol: `s${i}`,
        callers: [],
        endpoints_affected: [],
        crons_affected: [],
      })),
    };
    const client = await connect(stubApi({ getBlastRadius: async () => many }));
    const out = textOf(
      await client.callTool({
        name: 'get_blast_radius',
        arguments: { repo: 'acme/payments-api', pr: '482', limit: 2 },
      }),
    );
    expect(out).toContain('+3 more');
  });

  it('returns the API summary verbatim when there is nothing to report', async () => {
    const client = await connect(stubApi());
    const out = textOf(
      await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/payments-api', pr: '482' } }),
    );
    expect(out).toBe(EMPTY_BLAST.summary);
  });
});

/**
 * The Inspector path. A person driving the tools by hand has ids, not names —
 * they copy them out of the DevDigest studio URL and out of `list_agents` — so
 * every place that takes a name takes an id too. These are the tests that stop
 * that from quietly regressing back to names-only.
 */
describe('addressing by uuid', () => {
  const REPO_UUID = '639f9292-8f9c-4c2a-90a7-2c48ff86fe6c';
  const PR_UUID = 'a23e635c-cb87-4230-8bb8-ff3fa63d1c30';
  const AGENT_UUID = '6ecf9f1d-56c1-4047-a2c7-774e2e49498f';

  const uuidApi = () =>
    stubApi({
      listAgents: async () => [agent({ id: AGENT_UUID, name: 'Test Quality Reviewer' })],
      listConventions: async () => [convention({})],
    });

  it('takes a pull-request uuid with no repo at all', async () => {
    const api = stubApi();
    const client = await connect(api);
    await client.callTool({ name: 'run_agent_on_pr', arguments: { pr: PR_UUID } });
    // Straight through: no listRepos/listPulls lookup, the uuid IS the id.
    expect(api.started).toEqual([{ prId: PR_UUID, target: { all: true } }]);
  });

  it('takes a repo uuid where it takes owner/name', async () => {
    const client = await connect(uuidApi());
    const out = textOf(
      await client.callTool({ name: 'get_conventions', arguments: { repo: REPO_UUID } }),
    );
    expect(out).toContain('Services end in Service');
  });

  it('tolerates whitespace around a pasted uuid', async () => {
    // Copying out of an address bar picks up stray whitespace routinely; the
    // failure it would otherwise cause ("no repo matches") points at the wrong
    // thing entirely.
    const client = await connect(uuidApi());
    const out = textOf(
      await client.callTool({ name: 'get_conventions', arguments: { repo: `  ${REPO_UUID}\n` } }),
    );
    expect(out).toContain('Services end in Service');
  });

  it('targets an agent by id as well as by name', async () => {
    const api = stubApi({ listAgents: async () => [agent({ id: AGENT_UUID, name: 'Test Quality Reviewer' })] });
    const client = await connect(api);
    await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { pr: PR_UUID, agent: AGENT_UUID },
    });
    expect(api.started[0]?.target).toEqual({ agentId: AGENT_UUID });
  });

  it('surfaces the ids in list_agents, so the handoff has a source', async () => {
    const client = await connect(uuidApi());
    const out = textOf(await client.callTool({ name: 'list_agents', arguments: {} }));
    expect(out).toContain(AGENT_UUID);
  });

  it('takes a pasted GitHub PR URL, repo and number and all', async () => {
    // The URL is what is on the clipboard when someone is looking at the PR.
    const api = stubApi();
    const client = await connect(api);
    await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { pr: 'https://github.com/acme/payments-api/pull/482' },
    });
    expect(api.started).toEqual([{ prId: 'pr-1', target: { all: true } }]);
  });

  it('takes a pasted DevDigest studio PR URL', async () => {
    const api = stubApi();
    const client = await connect(api);
    await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { pr: `http://localhost:3002/repos/${REPO_UUID}/pulls/482` },
    });
    expect(api.started).toEqual([{ prId: 'pr-1', target: { all: true } }]);
  });

  it('lets the URL win over a repo argument that disagrees with it', async () => {
    // Reviewing the wrong PR silently is worse than either answer being wrong.
    const api = stubApi();
    const client = await connect(api);
    const res = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'other/thing', pr: 'https://github.com/acme/payments-api/pull/482' },
    });
    expect(res.isError).toBeFalsy();
    expect(api.started).toEqual([{ prId: 'pr-1', target: { all: true } }]);
  });

  it('takes a pasted repo URL where it takes owner/name', async () => {
    const client = await connect(uuidApi());
    const out = textOf(
      await client.callTool({
        name: 'get_conventions',
        arguments: { repo: 'https://github.com/acme/payments-api' },
      }),
    );
    expect(out).toContain('Services end in Service');
  });

  it('treats a cleared repo field as absent, not as a repo named ""', async () => {
    // Hosts send "" (or "  ") for a field the user typed into and then cleared.
    // Read literally it produced `No imported repo matches "  "`, which blames
    // the repo name for a missing argument.
    const client = await connect(stubApi());
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { pr: '482', repo: '   ' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Pass `repo`');
    expect(textOf(result)).not.toContain('No imported repo matches');
  });

  it('ignores a cleared repo alongside a pr uuid, which needs none', async () => {
    const api = stubApi();
    const client = await connect(api);
    await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { pr: PR_UUID, repo: '' },
    });
    expect(api.started).toEqual([{ prId: PR_UUID, target: { all: true } }]);
  });

  it('rejects a pr string that is neither a number nor a uuid, and says which', async () => {
    const client = await connect(stubApi());
    const result = await client.callTool({ name: 'run_agent_on_pr', arguments: { pr: 'PR-482' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not a PR number, a pull-request id, or a PR URL');
  });

  it('asks for a repo when given a bare PR number without one', async () => {
    const client = await connect(stubApi());
    const result = await client.callTool({ name: 'run_agent_on_pr', arguments: { pr: '482' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('owner/name');
  });
});

describe('api failures', () => {
  it('turns an unreachable API into an actionable isError result', async () => {
    const client = await connect(
      stubApi({
        listAgents: async () => {
          throw Object.assign(new Error('Cannot reach the DevDigest API at http://x'), { name: 'ApiError' });
        },
      }),
    );
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Cannot reach the DevDigest API');
  });
});
