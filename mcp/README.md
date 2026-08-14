# `@devdigest/mcp` — `devdigest-mcp`

DevDigest's reviewers, callable from inside an agent session. An MCP server over
stdio that talks to the DevDigest API on `:3001`.

Why it exists and what was deliberately left out: [`../specs/06-mcp-server.md`](../specs/06-mcp-server.md).

## Tools

Every tool takes **either a name or a uuid**: `repo` accepts `owner/name` or the
repo id, `pr` accepts the PR number or the pull-request id, and `agent` accepts
the agent's name or its id. Names are what a model has in a checkout; ids are
what a person copies out of the studio URL or out of `list_agents`. A `pr` uuid
identifies the PR on its own, so `repo` may be omitted with one.

| Tool | Does | Read-only |
| --- | --- | --- |
| `list_agents` | The configured reviewers: name, provider/model, strategy, CI gate | yes |
| `run_agent_on_pr` | Starts a review, waits up to 120 s, returns findings inline (or a partial result plus run ids if the wall is hit) | **no** |
| `get_findings` | Status, verdict, score and findings of a run | yes |
| `get_conventions` | A repo's mined house rules, each with its evidence line | yes |
| `get_blast_radius` | What a PR reaches: changed symbols, callers, endpoints, crons | yes |

Pull requests are addressed the way you would say them out loud:
`repo: "acme/payments-api", pr: 482`.

## Bring it up from zero

**This server is not started by `./scripts/dev.sh`, and that is deliberate.** An
MCP server is spawned by its *host* — Claude Code, Claude Desktop, the Inspector
— over stdio, on demand, one process per session. A copy launched by the stack
script would own no stdio pair, serve no client, and only compete for the API.
So the stack and this server come up independently, and `dev.sh` installs
nothing here either.

You need **Node ≥ 22** and **Docker** (for the stack's Postgres). This package
uses **npm**, not pnpm.

### 1. Bring up the stack it talks to

This server holds no state and no business logic — it is a client of the
DevDigest API. Nothing works until that API answers. From the repo root:

```sh
./scripts/dev.sh --no-client     # Postgres + API on :3001, no Next.js
```

Leave it running in its own terminal. Confirm before going further:

```sh
curl -s http://localhost:3001/health     # → {"status":"ok"}
```

If you want reviews to actually produce findings rather than "the diff is
empty", the stack also needs a `GITHUB_TOKEN` and an LLM key — set them in the
DevDigest UI under Settings, or in `server/.env`. That is the stack's concern,
not this package's.

### 2. Install this package's deps — once

```sh
cd mcp
npm ci          # npm, not pnpm — this package has its own package-lock.json
```

### 3. Smoke-test the binary with no host at all

Do this before touching any host config. It proves the server starts, speaks the
protocol and registers its tools — so if a host later shows nothing, you already
know the problem is the host, not the server:

```sh
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-07-28","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node bin/devdigest-mcp.mjs
```

The last line is JSON containing all five tool names. This step needs no API and
no host: nothing is fetched until a tool is actually called.

### 4. Drive it by hand in the Inspector

```sh
npx @modelcontextprotocol/inspector node bin/devdigest-mcp.mjs
```

Call `list_agents` first — it is the cheapest round trip that proves the server
can reach the API. If it returns the `Cannot reach the DevDigest API…` message,
go back to step 1.

### 5. Raise the tool call timeout before registering with a host

`run_agent_on_pr` blocks for up to 120 s. Most MCP hosts, including
Claude Code, cap a single tool call well under that (the MCP TypeScript SDK's
client default is 60 s) and **do not** extend it for progress notifications —
it is a hard per-call wall. Raise it or the host will cut the call before the
review finishes:

```sh
export MCP_TOOL_TIMEOUT=150000   # ms; comfortably above the 120s wall
```

This is a convenience, not a correctness requirement — a review keeps running
on the server (`agent_runs`) even if the MCP call is cut off, and `get_findings`
will still collect it afterwards. Without the raised timeout you just lose the
inline result and fall back to polling `get_findings` yourself.

### 6. Register it with a host

Paths must be **absolute** — the host spawns the process from its own working
directory, not from this one.

#### Any host, by config (the form that always works)

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "node",
      "args": ["/absolute/path/to/dev-digest/mcp/bin/devdigest-mcp.mjs"],
      "env": {
        "DEVDIGEST_API_URL": "http://localhost:3001",
        "MCP_TOOL_TIMEOUT": "150000"
      }
    }
  }
}
```

#### Claude Code, by CLI

```sh
claude mcp add devdigest -- node /absolute/path/to/dev-digest/mcp/bin/devdigest-mcp.mjs
```

Check `claude mcp add --help` for the flag that sets env vars in your version,
or just use the config form above — `MCP_TOOL_TIMEOUT` has to reach the process
one way or the other.

Then, in a **new** session: `/mcp` should list `devdigest` with five tools.

### Environment

| Variable | Default | What it does |
| --- | --- | --- |
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Where the DevDigest API listens |
| `MCP_TOOL_TIMEOUT` | host-dependent (SDK default 60 s) | How long the **host** allows one tool call. Must exceed the wait wall below |
| `DEVDIGEST_MCP_WAIT_MS` | `120000` | How long `run_agent_on_pr` waits before returning a partial result |
| `DEVDIGEST_MCP_POLL_MS` | `2000` | How often it polls the API while waiting |
| `DEVDIGEST_MCP_REQUEST_TIMEOUT_MS` | `15000` | Per-HTTP-request timeout, so a hung connection cannot eat the wait budget |

These are operator knobs and stay out of the tool schemas on purpose — a schema
field is paid for in the context window of every session, an env var is free.

Handy for a fast demo: `DEVDIGEST_MCP_WAIT_MS=5000` makes the wall fire in five
seconds, so you can see the partial-result path without waiting two minutes.

## Test it

```sh
npm test           # 25 tests: the real server driven by an in-memory MCP client
npm run typecheck  # this IS the build; the package emits no JS
```

The suite stubs only the HTTP layer, so schema validation, the `isError`
envelope, the poll loop, cancellation and progress are all exercised for real.
Three of the tests are guards rather than feature coverage: exactly five tools,
`tools/list` under 4000 characters, and the read/write annotations.

## When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| `"…" is neither a PR number nor a pull-request id` | A `pr` string that is not a uuid | Pass the number (`482`) or the uuid from the studio URL |
| `Cannot reach the DevDigest API…` | The stack is not up | Step 1; check `curl localhost:3001/health` |
| Host shows the server but no tools | Server failed to start | Run step 3 by hand; errors go to stderr, which the host shows as server logs |
| `No imported repo matches "…"` | Repo not imported into DevDigest | The message lists the repos that *are* imported; add yours in the UI |
| `PR #N is not imported for …` | PR not synced | Open the repo's PR list in the UI once |
| `No changed files recorded for this PR` from `get_blast_radius` | The PR's diff was never imported | Open the PR once in the studio — `GET /pulls/:id` is what imports it |
| Review call dies around 60 s | Host cut the call | Raise `MCP_TOOL_TIMEOUT` (step 5). The run survives — collect it with `get_findings` |
| `Rate limited: … 10 requests per minute` | Too many reviews started | Wait a minute; the limit is the API's, not this server's |
| Reviews return `approve · 100` and "the diff is empty" | Stack has no `GITHUB_TOKEN` or no clone | Set the token in Settings, re-import the PR |
| Tools missing after editing the code | Host caches the process | Restart the host session; the server is spawned once per session |

## A session, end to end

The common case — the review finishes inside the wait window and the tool
returns findings directly, no polling from the model:

```
list_agents                                            → General, Security
run_agent_on_pr  acme/payments-api #482      → request_changes · 62
                                                          CRITICAL security src/auth.ts:41 — …
get_conventions            acme/payments-api           → error-handling — …
```

The timeout path — the review is still running when the 120 s wall hits, so
the tool returns what finished plus a pointer to collect the rest:

```
run_agent_on_pr  acme/payments-api #482      → partial: General done (approve · 88)
                                                          Security still running (run_id 8f3c…)
                                                          → get_findings run_id: 8f3c…
get_findings               run_id 8f3c…                → request_changes · 62
                                                          CRITICAL security src/auth.ts:41 — …
```

## Design notes

- **Cheap at session start.** Everything the server advertises lands in the
  context window of every new chat. `tools/list` is held under 4000 characters
  (≈900 tokens) by a test; there is no `outputSchema` anywhere, and descriptions
  are one line. See "Token budget" in [`AGENTS.md`](AGENTS.md).
- **Compact by default.** Responses are one line per row; pass
  `detail: "full"` for rationale and suggestions. Capped lists say how many rows
  they dropped.
- **The run tool blocks, up to 120 s, and returns findings inline.** It polls
  the server rather than waiting on a stream, and on the wall it returns a
  partial result — never an error — with a pointer to `get_findings` for what
  is still running. See "Raise the tool call timeout first" above.
- **Errors carry the fix.** An unreachable API, an unimported repo or an unknown
  agent all come back as `isError` results naming what to do — the model reads
  them and retries.

## Develop

Commands are under [Test it](#test-it). Read [`AGENTS.md`](AGENTS.md) before
changing anything here — the token budget and the "never emits JS" constraint
are not inferable from the code.
