# mcp (`@devdigest/mcp`) — agent notes

**npm, not pnpm.** This package has its own `package-lock.json`.

`devdigest-mcp` exposes DevDigest's reviewers to any MCP host (Claude Code,
Claude Desktop, …) over stdio. It is a **thin client of the HTTP API on `:3001`**
— it holds no state and no business logic. Intent and rationale live in
`../specs/06-mcp-server.md`.

## Commands

```sh
npm test           # vitest — drives the real server through an in-memory MCP client
npm run typecheck  # tsc --noEmit — this IS the build; the package emits no JS
npm run dev        # tsx src/index.ts — stdio, for piping JSON-RPC by hand
```

## Conventions

- **Never emits JS.** `@devdigest/shared` is reached through a tsconfig path
  alias into `server/src/vendor/shared`, so `tsc -p` with an `outDir` pulls those
  sources into the program and writes them to `dist/` too, shifting every output
  path. The `bin/` shim registers tsx's ESM loader and imports the TS source
  instead. Same arrangement as `reviewer-core`.
- **`@devdigest/shared` is `import type` only.** A runtime import (a Zod schema)
  would emit a bare specifier node cannot resolve.
- `src/api.ts` is the only file that speaks HTTP. Tools depend on the
  `DevDigestApi` interface, which is what lets the tests run the whole server
  against a plain object.
- One tool per file under `src/tools/`, registered in `src/server.ts`.
  `buildServer()` attaches no transport — `src/index.ts` is the only file that
  knows about stdio.
- **stdout belongs to the protocol.** Diagnostics go to stderr; a stray
  `console.log` corrupts the stream and the host drops the connection.

## Token budget — the constraint that shapes this package

Everything registered here is pasted into the context window of **every new chat**
before the user types a word. Input schemas are 60–80% of that cost.

- `tools/list` must serialise to **under 4000 characters** (≈ 900 tokens). Pinned
  by a test in `test/tools.test.ts`. Adding a tool means staying under it.
  Measured 2026-08-13: **3910** — 90 chars of headroom, so the next schema field
  is a real trade, not a rounding error. Making `get_blast_radius` real pushed it
  to 4016 and the guard failed; three over-long descriptions were trimmed rather
  than the limit raised. Trim descriptions first, and re-measure by temporarily
  logging `len` in that test.
- One-line descriptions. `.describe()` only where the model cannot guess.
- **No `outputSchema`** — it is advertised in `tools/list` and would roughly
  double the static cost, and these results are read by a model, not a program.
- Responses are compact by default (one line per row), with `detail: 'full'` to
  opt into prose. `list_agents` must never return `system_prompt` — kilobytes per
  agent, and irrelevant to choosing one.
- Every capped list ends with `… +N more`, so a cap is never read as
  completeness.

## Gotchas

- **The API must be running.** `./scripts/dev.sh --no-client` is enough. An
  unreachable API surfaces as an `isError` result that names the fix, not a crash.
- `PrMeta.id` is nullish by contract — a PR seen on GitHub but not yet persisted
  has no local id. `resolve.ts` treats that as "not imported".
- `get_findings` without a `run_id` reports the **newest run per agent at the
  newest `head_sha`** — two filters, and both are load-bearing. Not the newest
  single run: a fan-out starts one run per enabled reviewer, so showing one would
  read as the whole answer. But not every run at that head either: `head_sha`
  moves only when the PR is pushed to, so re-reviewing the same commit piles pass
  on pass under one head. Measured live on the seeded PR after three passes —
  11 runs, up to 3 per agent, one head. Dropping the per-agent dedupe turns the
  package's compact tool into its largest response, and it grows with every
  re-review. `src/tools/get-findings.ts`
- `get_blast_radius` takes the **PR**, not a file list. The server derives the
  changed files from `pr_files`, so a caller that can name the PR needs nothing
  else — and cannot analyse a diff it reconstructed wrongly. Its first line is
  always the API's `summary`, which is what separates "nothing calls this" from
  "the index could not say"; never render the caller list without it.
- **No input property may be a union.** `pr` is `z.string()` even though it
  holds a number, because `z.union([number, string])` serialises to `anyOf`, and
  a host with no widget for `anyOf` falls back to a raw JSON editor — in the MCP
  Inspector that editor re-encodes on every keystroke, so quotes accumulate
  backslashes and Backspace does nothing. The tool is then unusable by hand.
  `resolve.ts` parses the digits instead. Pinned by a test that walks every
  tool's `inputSchema.properties` and fails on `anyOf`/`oneOf`. Dropping the
  union also freed 195 chars of the session budget, so this is not a trade.
- **Every tool takes a name or a uuid.** `resolve.ts` short-circuits on anything
  matching `UUID_RE` (trimmed — a value pasted from an address bar carries
  whitespace), and `findAgent` matches on `id` or `name`. This exists because
  the Inspector is where these tools are first driven by hand, and there the
  caller has ids, not names. It costs nothing in the schema: the parameter is a
  string either way. Do not "simplify" it back to names-only.
- Errors are returned as `isError` results, never thrown: the model reads the
  message and retries. Phrase every one of them with the fix in it.
- **`run_agent_on_pr` blocks, and the wait window is bigger than what
  most hosts allow a single tool call.** It waits up to 120 s
  (`DEVDIGEST_MCP_WAIT_MS`), but the MCP TypeScript SDK's client default is
  `DEFAULT_REQUEST_TIMEOUT_MSEC = 60_000` — half that — and progress
  notifications do **not** extend a host's per-call wall in Claude Code; it is
  hard, not a soft heartbeat budget. Document this as a real setup requirement
  (`MCP_TOOL_TIMEOUT`, see `README.md`), don't quietly shrink the wall to fit —
  the review survives on the server regardless of whether the MCP call is still
  attached to it (`agent_runs`), so a host that cuts the call early still
  leaves `get_findings` able to collect the result. That's also why the wall
  returns a **partial** result and never an `isError`: hitting the wall is not
  a failure, it's "still running, come back for it."
- **Poll `GET /pulls/:id/runs`, not the `GET /runs/:id/events` SSE stream.**
  Events are per-run; a fan-out review starts one run per enabled reviewer, so
  following it over SSE would mean one connection per reviewer. The pulls-runs
  endpoint covers all of them in one request, and at the 2 s poll interval
  that's ~30 req/min against the global 120/min limit (`server/src/app.ts:96`)
  — cheap enough not to think about.
- **Timing is injected, not read from `process.env` deep in the poll loop** —
  so tests drive it directly instead of needing fake timers around a real
  `setInterval`. If you touch the wait/poll logic, keep that seam; don't reach
  for `vi.useFakeTimers()` as the fix for a slow test instead.
- **`DEVDIGEST_MCP_WAIT_MS` / `_POLL_MS` / `_REQUEST_TIMEOUT_MS` must never
  become tool input parameters**, even though it would be a small schema
  addition. A schema field is paid for in every session (see "Token budget"
  above); these are operator/deployment knobs, not something a model should be
  choosing per call. Env is free; keep it there.

## Read when

- Read `../specs/06-mcp-server.md` for why the surface looks like this and what
  was deliberately left out.
- Read `README.md` for how to register the server with a host.
- Read `../INSIGHTS.md` (root) for what was already tried — this package is
  cross-cutting and has no `INSIGHTS.md` of its own. Run the
  `engineering-insights` skill at the end of a task here.
- Read `../server/README.md` before adding a tool: every tool is an existing
  endpoint, and a tool that needs a new one is a server change first.
