# `devdigest-mcp` — DevDigest's reviewers as MCP tools

**Status:** shipped 2026-08-15 (`run_agent_on_pr` blocking; blast radius live
via `GET /pulls/:id/blast`, `server/src/modules/blast/routes.ts:22`)
**Packages touched:** `mcp/` (new). No change to `server`, `client`,
`reviewer-core` or `@devdigest/shared`.
**Lesson:** L04, first half. The second half is Blast Radius over `repo-intel`.

---

## Problem

DevDigest is reachable through its web UI and its HTTP API on `:3001`, and
nowhere else. The place a reviewer's output is most useful is inside the agent
session that is writing the code — and that session cannot see it. The same goes
in reverse: a repo's mined conventions are house rules an agent should be reading
*before* it writes, not after a human pastes them in.

## Scope

**In** — a standalone `mcp/` package; a stdio MCP server exposing five tools;
addressing by name **or** uuid (`owner/repo` + PR number, or the ids copied out
of the studio URL); compact responses; tests.

**Out** — any change to the server or client; real blast radius; authentication
(the API runs `LocalNoAuthProvider` against a single default workspace);
publishing to npm; resources and prompts (tools only).

## Contract changes

**None.** Every endpoint the tools call already exists and is used as-is:

| Tool | Endpoints |
| --- | --- |
| `list_agents` | `GET /agents` |
| `run_agent_on_pr` | `GET /repos`, `GET /repos/:id/pulls`, `POST /pulls/:id/review` |
| `get_findings` | + `GET /pulls/:id/runs`, `GET /pulls/:id/reviews` |
| `get_conventions` | + `GET /repos/:id/conventions?status=` |
| `get_blast_radius` | `GET /pulls/:id/blast` (added by `specs/08-blast-radius.md`) |

`POST /pulls/:id/review` is **still** fire-and-forget on the server side:
`ReviewService.runReview` creates the `agent_runs` rows, returns the run ids,
and executes in the background (`server/src/modules/reviews/service.ts:103`).
Nothing on the server changes. The blocking behaviour below lives entirely in
`mcp/`, which polls `GET /pulls/:id/runs` after kicking off the review.

## The design decisions worth stating

**A separate package, over stdio, speaking HTTP.** MCP hosts spawn stdio servers;
the alternative — a Fastify module serving Streamable HTTP on `/mcp` — would mix
two protocols in one app and require Host/Origin validation for no gain here.
`mcp/` holds no state and no business logic: it resolves names to ids, calls the
API, and renders the answer compactly.

**Names, not uuids.** Tools take `repo: "acme/payments-api"` and `pr: 482`,
because that is what a model can see in a checkout. `src/resolve.ts` maps them to
ids and memoises successes for the process lifetime — misses are never cached,
since "not imported yet" is a state the user can fix mid-session.

**The run tool blocks, up to a 55 s wall, and returns findings inline.**
`run_agent_on_pr` calls `POST /pulls/:id/review` (which still returns
immediately server-side), then polls `GET /pulls/:id/runs` every 2 s until every
run it started has finished or the wall is hit. On the wall it returns a
**partial** result — the runs that finished, plus the run ids still going and a
pointer to `get_findings` — never an error, since the review keeps running on
the server regardless of whether the MCP call is still waiting on it.

Polling, not the existing SSE stream: `GET /runs/:id/events` streams **one**
run, so a fan-out review (one run per enabled reviewer) would need one
connection per reviewer, while `GET /pulls/:id/runs` covers all of them in a
single request. At the 2 s interval that is well inside the global rate limit —
30 req/min against 120/min (`server/src/app.ts:96`).

`notifications/progress` is sent while waiting, but only when the client
supplied a `progressToken` — the MCP spec makes it opt-in per call. Cancellation
(`ctx.mcpReq.signal`) stops the polling loop; the runs it started keep
executing server-side either way.

Wait/poll timing (`DEVDIGEST_MCP_WAIT_MS`, `DEVDIGEST_MCP_POLL_MS`,
`DEVDIGEST_MCP_REQUEST_TIMEOUT_MS`) is env-overridable, deliberately **not** a
tool input parameter: a schema field is paid for in every session (see "Token
cost" below); an env var is free and this is an operator knob, not something a
model needs to choose per call.

`get_findings` keeps its place in the surface, but its role shifts: it is no
longer the primary way to collect a result, only the way to collect after a
55 s timeout, or to re-read the same run at a different `detail`.

> **Rejected: the run tool never blocks, `get_findings` polls.** The original
> design returned `run_id` immediately on the theory that a review takes tens
> of seconds and a blocking tool call risks a host timeout and dumps the whole
> result into context at once. This was overruled: in practice the two-call
> shape (`run_agent_on_pr` then `get_findings`) cost a full
> conversation turn per poll, which is worse for a model than one call that
> waits — and the host-timeout risk is bounded and documented (see
> `mcp/AGENTS.md`) rather than designed around, since the run's own progress is
> durable on the server independent of whether the MCP call is still attached
> to it.

**Token cost is a design constraint, not an afterthought.** Everything an MCP
server advertises is pasted into every new chat before the user types. Input
schemas are 60–80% of that cost. Concretely:

- Five tools, no resources, no prompts. Dynamic toolsets / `search_tools` pay off
  at 40–400 tools and cost 2–3× more round trips — at five they are a net loss.
- One-line descriptions; `.describe()` only where the model cannot guess.
- **No `outputSchema` anywhere.** It is advertised in `tools/list` and would
  roughly double the static cost; these results are read by a model, not a
  program. Revisit if that changes.
- Responses are one line per row, compact by default, `detail: 'full'` to opt
  into prose. `list_agents` never returns `system_prompt`.
- Every capped list ends with `… +N more — raise \`limit\``, so a cap is never
  mistaken for completeness.

**`get_blast_radius` is real, not a stub.** See `specs/08-blast-radius.md` and
the summary-first rule (`mcp/AGENTS.md:72-76`): the tool's first line is always
the API's `summary`, which is what separates "nothing calls this" from "the
index could not say".

## Acceptance criteria

1. `cd mcp && npm run typecheck && npm test` pass.
2. `tools/list` serialises to **under 4000 characters** (≈ 900 tokens). Pinned by
   a test; it is the guard that keeps session-start cost from drifting.
3. The four read tools carry `readOnlyHint: true`, the run tool `false`.
4. `list_agents` output contains no `system_prompt`.
5. Against a running stack: `run_agent_on_pr` on the seeded
   `acme/payments-api` #482 blocks and returns the finished runs' verdict,
   score and findings inline when the review completes inside the wait window.
6. Against a running stack with a review forced past the wait window (or
   `DEVDIGEST_MCP_WAIT_MS` lowered): `run_agent_on_pr` returns a
   **partial** result before the wall — the runs already finished, the run ids
   still going, and a pointer to `get_findings` — never an `isError`.
7. `get_blast_radius` returns the PR's impact map, summary first.

## Open questions

~~- Blast radius needs an HTTP route before the tool can be real…~~ **Resolved
  2026-08-13:** the route is `GET /pulls/:id/blast` and the tool takes the **PR**,
  not a file list — the server already knows which files the PR touches, so a
  caller that reconstructs the diff can only get it wrong. See
  `specs/08-blast-radius.md`.
- ~~Whether to lower the default wall to fit inside the common-host default, or
  keep 120 s and rely on `MCP_TOOL_TIMEOUT`, is left to see how it plays out in
  practice.~~ **Resolved 2026-08-14:** it played out badly. At 120 s the host's
  60 s limit always fired first, killing the call and discarding the result, so
  the partial-result path this spec designed never executed once — the caller
  just saw "MCP request timed out after 60000ms". The wall is now 55 s, under
  the host default, so OUR timeout is the one that fires and it returns finished
  runs plus run ids. Raising it requires raising the host's limit too — see `mcp/README.md` and `mcp/AGENTS.md` for the mitigation
  either way (the run survives on the server; `get_findings` collects it).
