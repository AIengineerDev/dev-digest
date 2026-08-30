# Multi-Agent Review — remediation, round 2

**Round:** 2 of 2 (final — the loop closes after this, findings open or not)
**Parent plan:** `plans/14-multi-agent-review.plan.md`
**Round 1:** `plans/14-multi-agent-review.remediation.plan.md` — four findings, all closed
**Authored by:** the `/impl` driver, not `implementation-planner`

**Why driver-authored, stated rather than hidden:** the chain's rule is that an
implementer works from a plan file so it never decides for itself what is worth
fixing. That rule is preserved here — this file is the plan, and its scope is
one line. What is skipped is the planner *agent*, because a full planning cycle
for a single `response:` declaration costs more than the fix. The finding already
carries its own smallest-fix instruction from the reviewer.

## The finding

Round 1's contract fix declared route `response` schemas for two of the three new
contracts and missed the third. `GET /pulls/:id/multi-agent-runs/:multiAgentRunId`
validates `params` only, so `MultiAgentRunView` survives as a TypeScript return
annotation that vanishes at runtime — nothing enforces the shape or strips extra
fields at the HTTP boundary.

Severity low. It is a gap created *by* the fix round, which is the reason a
re-review exists.

## Phase 1 — the third response schema

- **What lands:** the results route declares its response schema like its two
  siblings do.
- **Files:** `server/src/modules/reviews/routes.ts:119-126`.
- **Decision:** match the exact pattern already used at `:129-136` and `:139-142`
  — `response: { 200: MultiAgentRunView }`. `MultiAgentRunView` is already
  exported from `@devdigest/shared` and already imported in this file; no
  contract change, no `check-shared.sh` run, no client change.
- **Gate:**
  ```
  cd server && pnpm typecheck && pnpm arch
  cd server && pnpm exec vitest run test/multi-agent.it.test.ts
  ```
- **Done when:** the route carries the schema; `pnpm arch` reports no new
  violations against the 10-entry baseline; and `multi-agent.it.test.ts` still
  passes 5/5 against real Postgres — that suite already calls this route, so a
  serializer that rejects the real payload fails the gate rather than shipping.

## Out of scope

Everything else. In particular, **do not** add a workspace predicate to
`reviewsForRunIds` (`server/src/modules/reviews/repository/review.repo.ts:77-92`).
The security review considered it and dropped it: its only caller feeds run ids
already filtered by workspace and group in the preceding statement, so it is
defence-in-depth, not a finding. It is recorded in the run file instead.
