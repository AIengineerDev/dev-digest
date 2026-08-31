# Multi-Agent Review — Development Plan

**Spec:** `specs/14-multi-agent-review.md`
**Execution mode:** single implementer

## Goal / Done when

Picking N agents from `Run Review ▾` on a PR page starts one grouped fan-out whose runs share a `multi_agent_run_id`, and `/repos/:repoId/pulls/:number/multi-agent/:id` renders those agents' findings side by side in Columns and Tabs with a server-computed `Where agents disagree` block — none of which is reachable today.

## Requirement audit

| Requirement | Problem | Effect on this plan |
| --- | --- | --- |
| `specs/14-multi-agent-review.md:118-119` ("`GET /pulls/:id/runs` serves the results page by filter, and no new read route or wrapper contract is needed") | **Contradicts R5.** The results URL is `/repos/:repoId/multi-agent/:multiAgentRunId` (`:219`) and carries no PR id. `GET /pulls/:id/runs` is keyed by PR uuid (`server/src/modules/reviews/routes.ts:104`, `service.ts:70`), and nothing in the codebase resolves a `multi_agent_run_id` to a `pr_id`. The page cannot call it. | **Resolved by the CTO after this plan was written, and the spec now says so.** The results page is nested under the PR route — `/repos/:repoId/pulls/:number/multi-agent/:id` — so the PR is structurally in the path. One new route `GET /pulls/:id/multi-agent-runs/:multiAgentRunId` returns `MultiAgentRunView = {runs, groups}` with **no `pr_id` field**, because the path already carries it. |
| `specs/14-multi-agent-review.md:185` ("The server groups findings into `FindingGroup[]`") | **Not checkable as stated** — no route, no response shape, no client fetch is named anywhere in the spec. C3 defines the object and nothing serves it. | Folded into the same assumed route above. Grouping itself stays pure and hermetic per N3. |
| `specs/14-multi-agent-review.md:158-159` ("The existing `Run all` and per-agent items stay") vs `runs.json:127` `page.runAll` / `:114` `page.subtitle`, both written for run-all | **Unanswered by the CTO.** The spec keeps `Run all` in the *dropdown* but never says whether the *results page* keeps a `Run all agents` affordance, and `page.subtitle` ("every enabled agent in parallel") and `page.noRun.cta` ("Run all agents") both assume it does. | **Assumed:** `Run all` stays in the dropdown only (it is an existing shipped path, `RunReviewDropdown.tsx` `runReview.runAll`); the results page gets no run trigger, and `page.subtitle` / `page.noRun.*` are reworded in Phase 8 to describe *the agents in this run*. Named here rather than decided silently — reverse it by changing the strings in Phase 8 alone. |
| `specs/14-multi-agent-review.md:156` ("a checkbox per enabled agent, a `Clear` action, and a primary `Run multi-agent review (N)`") | **Not buildable in the host it names.** `RunReviewDropdown` renders `Dropdown` from `@devdigest/ui`, whose entire API is `items: DropdownItemDef[]` — `{label, icon, hint, muted, divider, onClick, onRemove}` (`client/src/vendor/ui/kit/types.ts:5-16`) — flat buttons that call `onClose()` on every click (`kit/Dropdown.tsx:5-17`). No children slot, no checkbox item, no way to click three things without the popover closing. `kit/` is under do-not-touch `client/src/vendor/**`. | **Assumed:** the picker is a *sibling popover* owned by the client, not a vendored-`Dropdown` extension — `RunReviewDropdown/AgentPickerPopover.tsx` (Phase 7). The vendored `Dropdown` and its items are untouched. |
| `specs/14-multi-agent-review.md:239` ("queued → running → done/failed") | **Not observable.** `createAgentRun` inserts `status: 'running'` directly (`server/src/modules/reviews/repository/run.repo.ts:139`); there is no `queued` status in the schema or anywhere else. | **Assumed:** the column renders `running` from row creation. No `queued` state is invented and no status enum is widened — a new status value would change `reapStaleRunningRuns` and the PR page's live status, which is out of scope. |
| `specs/14-multi-agent-review.md:329` ("results page redirects to the normal PR view") for a one-agent selection | Reachable only if the client knows the run is single before navigating — it does: `ReviewRunResponse.multi_agent_run_id` is null (C2). | None. Phase 7 navigates only on a non-null id. |
| `specs/14-multi-agent-review.md:421-427` (open questions 1 and 2 — re-runnable as a unit, `Needs review` status) | Open, but **non-blocking**: both answers leave every phase below unchanged. | Out of scope, listed under Scope/Out. |

## Context read

| Source | What it settled |
| --- | --- |
| `specs/14-multi-agent-review.md` (whole) | The eight requirements, the three deliberate cuts, and the worktree-A file boundary. |
| `server/src/modules/reviews/run-executor.ts:74` | `executeRuns` already loads diff+intent once, fans out, and isolates per-agent failure. **No execution work in this plan** — only target selection and grouping. |
| `server/src/modules/reviews/routes.ts:34-52` | `POST /pulls/:id/review` parses `RunRequest.parse(req.body ?? {})` by hand and forwards only `agentId`/`all` into `resolveTargets`. Both the parse and the forward need the third field. |
| `server/src/modules/reviews/service.ts:46-56` | `resolveTargets` is `all → listEnabled`, else single, else 400. No precedence logic exists to extend — it is written fresh. |
| `server/src/db/schema/runs.ts:8-63` | `agent_runs` has no `multi_agent_run_id`; `multi_agent_runs` is `{id, workspace_id, pr_id, ran_at}` with a `cascade` FK to `pull_requests`. |
| `server/src/vendor/shared/contracts/trace.ts:152-181` | `RunSummary` already carries `agent_name`, `status`, `error`, `duration_ms`, `cost_usd`, `findings_count`, `score`, `head_sha` — a column header needs no new field but the group id. |
| `server/src/modules/reviews/repository/run.repo.ts:40-70` | `listRunsForPull` returns `Promise<RunSummary[]>` by explicit field mapping — adding a contract field **breaks typecheck here**, so the mapping lands in the same phase as the contract. |
| `server/src/vendor/shared/contracts/findings.ts:46-61` | `Finding` uses `start_line`/`end_line`; C3's group uses `anchor_start`/`anchor_end`. The rename is at group level only; no finding is rewritten. |
| `server/src/vendor/shared/index.ts:18,21` | `export * from './contracts/review-api.js'` and `'./contracts/trace.js'` — C3 added to `review-api.ts` (where `FindingRecord` lives) needs **no barrel edit**. |
| `scripts/check-shared.sh:7-15` | `server/src/vendor/shared` is canonical; the client copy is an rsync mirror. Never hand-edit the client side. |
| `client/src/vendor/ui/kit/types.ts:5` · `kit/Dropdown.tsx:5,62` | The vendored `Dropdown` cannot host a multi-select. See audit. |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:17` | `import RunTraceDrawer from "./_components/RunTraceDrawer"` — the single mount. |
| `client/src/lib/hooks/reviews.ts:126-138,170` | `useRunReview` builds the POST body from `{agentId, all}` only; `useRunEvents(runIds: string[])` already subscribes N runs in parallel. |
| `client/src/components/` | `diff-viewer/`, `run-cost-badge/`, `page-shell/` — kebab-case folders, so `run-trace-drawer/` is the right destination name. |
| `server/INSIGHTS.md:145-155` | `multi_agent_runs` is structurally unusable; add the column, nullable, **never backfilled**. |
| `INSIGHTS.md:256-266` | Two branches both generating `0018_*` collide in `_journal.json` and the snapshot, which may not be hand-edited. Latest on `w8` is `0017_amusing_chimera.sql` — verified. |
| `server/INSIGHTS.md:95-101` | A generate that both adds and drops columns on one table prompts interactively and hangs a non-TTY shell. This migration is **add-only**, so one generate suffices. |
| `client/INSIGHTS.md:199-224` | `NAV` is vendored and the single static source; `useShellCommands` and the `g`-key handler both iterate it, so one nav entry buys the palette row and shortcut for free. Only add an item whose route exists. |
| `INSIGHTS.md:243-254` | `runs.json` is pre-seeded and consumed by nobody; a seeded string that contradicts the requirement **changes with the feature**. |
| `INSIGHTS.md:279-286` | The Pull Requests list's FINDINGS column uses latest-row scoping and is wrong for any multi-agent run. Noted, **not fixed here** — out of the owned file set. |

## Prior art and rejected approaches

- **2026-08-28 (`server/INSIGHTS.md:145`)** — Reading `schema/runs.ts` and concluding run grouping already works is the recorded trap. Nullable, `on delete set null`, never backfilled: pre-existing rows are legitimate single runs. Phase 1 and Phase 3 follow this exactly.
- **2026-08-28 (`INSIGHTS.md:256`)** — Parallel branches both generating `0018_*` cannot be merged textually. This branch generates **exactly one** migration, in Phase 1, and merges first; spec 15's branch deletes and regenerates. Do not generate a second migration later in this plan.
- **2026-08-09 (`server/INSIGHTS.md:95`)** — Add+drop in one `db:generate` hangs a non-TTY shell. Do not fold any column removal into Phase 1's generate.
- **2026-08-09 / 2026-08-10 (`client/INSIGHTS.md:213-224`)** — "Add a route and let the shell find it" does not work; `NAV` is the only source, it is vendored, and a route without an entry ships URL-only. This is why the sidebar entry was cut rather than added: the results page needs a run id, so a `GLOBAL` nav row would point at a route that cannot resolve — the 404 the file's own comment warns about. `nav.ts` is not edited by this plan.
- **2026-08-28 (`INSIGHTS.md:225-243`)** — `design-mocks/` is a stale artefact; the mock's `fan-out via worktrees` is false here. N1 stands: `runs.json:129` `fan-out via p-queue` is correct (`server/src/platform/jobs.ts:42`, concurrency 3) and **is not edited**.
- **2026-08-09 (`INSIGHTS.md:441-448`)** — The two vendored `@devdigest/shared` copies were hand-edited and drifted, including a Zod enum that made the client reject valid payloads. Only `check-shared.sh --fix` mirrors them.

## Scope

**In:**
- C1 `RunRequest.agentIds`, C2 `RunSummary.multi_agent_run_id` + `ReviewRunResponse.multi_agent_run_id`, C3 `FindingGroup`/`FindingGroupTake` — all in `server/src/vendor/shared`, mirrored.
- `agent_runs.multi_agent_run_id` + one generated migration.
- Subset resolution with `agentIds > agentId > all` precedence, de-duplication, disabled-agent drop, server-side cap of 8.
- Writing the `multi_agent_runs` row before queueing and stamping members.
- Pure grouping (`file` equality + line-range overlap) producing `FindingGroup[]` with a take per agent in the run, including silent ones.
- One read route serving the results page.
- The picker popover on `Run Review ▾`.
- `/repos/:repoId/pulls/:number/multi-agent/:id` in Columns and Tabs, with per-agent live status and per-agent failure.
- `Where agents disagree` with the `Show only conflicts` filter.
- The `RunTraceDrawer` folder move and its single import update.
- `runs.json` string edits; the `Configure run` phase with its estimate; one `GLOBAL` nav group with one item.

**Out:**
- ~~The per-agent estimate~~ — restored as R9 after the design refresh; it needs the read route Phase 5 adds.
- ~~The full-screen `Configure run` page~~ — restored as R8; it is in the refreshed design.
- A `MultiAgentRunSummary` wrapper contract (cut on purpose, `spec:119`).
- Any change to `executeRuns`, the p-queue, or its concurrency (N1, `spec:417-419`).
- `reviewer-core`, the grounding gate, scoring, eval cases.
- `ci/`, `agent-runner/`, `client/messages/en/ci.json`, `server/src/modules/agents/**` — spec 15's worktree.
- Re-running a multi-agent run as a unit; `Needs review` group awareness (spec open questions 1-2).
- Fixing the Pull Requests list's latest-row FINDINGS scoping (`INSIGHTS.md:279`) — a real bug, a different file set.
- Any regeneration of the `arch` or `lint` baseline.

## Contract changes

All in `server/src/vendor/shared/` (canonical), mirrored to the client by `./scripts/check-shared.sh --fix`. **One phase, one agent, before anything else.**

1. `contracts/platform.ts` — `RunRequest` gains `agentIds: z.array(z.string()).min(1).max(8).optional()`. `agentId` and `all` unchanged.
2. `contracts/trace.ts` — `RunSummary` gains `multi_agent_run_id: z.string().nullable()`.
3. `contracts/review-api.ts` — `ReviewRunResponse` gains `multi_agent_run_id: z.string().nullable()`.
4. `contracts/review-api.ts` — new `FindingGroupTake` and `FindingGroup` exactly as C3 (`spec:128-144`), placed here because `FindingGroupTake.finding` is `FindingRecord.nullable()` and `FindingRecord` is defined at `review-api.ts:15`.
5. `contracts/review-api.ts` — new `MultiAgentRunView = z.object({ runs: z.array(RunSummary), groups: z.array(FindingGroup) })`. No `pr_id`: the route is nested under the PR, so the path carries it. `RunSummary` lives in `trace.ts`, so import it there.

No barrel edit: `src/vendor/shared/index.ts:18,21` already re-exports both files.

**Consumers that follow:** `server/src/modules/reviews/repository/run.repo.ts:51-69` (the `RunSummary` field map — breaks typecheck otherwise), `routes.ts:38-48`, `service.ts:46,103`, and client-side `useRunReview` / the new hooks.

## Phases

### Phase 1 — Contracts, schema column, migration, mirror

- **What lands:** every shape this feature needs exists in `@devdigest/shared` on both sides, and `agent_runs` has a nullable `multi_agent_run_id` in a generated migration. Nothing behaves differently yet.
- **Files:**
  `server/src/vendor/shared/contracts/platform.ts` · `contracts/trace.ts` · `contracts/review-api.ts` · `server/src/db/schema/runs.ts` (add `multiAgentRunId: uuid('multi_agent_run_id').references(() => multiAgentRuns.id, { onDelete: 'set null' })` to `agentRuns`) · one **new generated** `server/src/db/migrations/0018_*.sql` + `meta/_journal.json` + `meta/0018_snapshot.json` · `server/src/modules/reviews/repository/run.repo.ts` (map `multi_agent_run_id: run.multiAgentRunId` into `listRunsForPull`, ~line 68) · `client/src/vendor/shared/**` (rsync output only) · `server/src/modules/reviews/routes.ts` (return `multi_agent_run_id: null` from the review route so `ReviewRunResponse` typechecks).
- **Governing skill:** `repo-conventions` — the migration is generated by `pnpm db:generate` and never hand-written or renumbered; `multiAgentRuns` is declared **after** `agentRuns` in `schema/runs.ts:54`, so reference it by the arrow form drizzle already uses for `agents`/`pullRequests` (`schema/runs.ts:13-14`) rather than reordering the file. The client `vendor/shared` copy is written **only** by `check-shared.sh --fix`.
  The decision already made: the column is **add-only**, so this is a single non-interactive `db:generate` (`server/INSIGHTS.md:95` — an add+drop generate prompts and hangs). It is also the **only** migration this branch produces (`INSIGHTS.md:256`).
- **Gate:**
  ```
  cd server && pnpm db:generate && pnpm db:migrate
  cd server && pnpm typecheck && pnpm arch
  cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/contracts.test.ts
  ./scripts/check-shared.sh --fix && ./scripts/check-shared.sh
  cd client && pnpm typecheck
  ```
- **Done when:** `git status` shows exactly one new `0018_*.sql` plus its journal and snapshot entries; `check-shared.sh` (no `--fix`) exits 0; `pnpm arch` still reports 11; both packages typecheck.
- **Depends on:** nothing.

### Phase 2 — Subset resolution, server-side (C1, R1 server half)

- **What lands:** `POST /pulls/:id/review` with `{agentIds: [a, b]}` creates exactly two `agent_runs` rows; precedence and the cap are asserted by a hermetic test.
- **Files:**
  `server/src/modules/reviews/helpers.ts` — new pure `selectTargets(body: RunRequest, enabled: AgentRow[], byId: Map<string, AgentRow>)` returning `{ targets: AgentRow[]; dropped: {agentId: string; reason: 'disabled' | 'unknown'}[] }`, applying `agentIds > agentId > all`, de-duplicating ids, and dropping disabled/unknown ids without throwing when at least one survives.
  `server/src/modules/reviews/service.ts:46-56` — `resolveTargets` fetches the candidate rows and delegates to `selectTargets`; still 400 (`AppError('invalid_run_request', …, 400)`) when nothing survives.
  `server/src/modules/reviews/routes.ts:38-42` — forward `body.agentIds` alongside `agentId`/`all`.
  `server/test/multi-agent-targets.test.ts` — **new, hermetic**.
- **Governing skill:** `onion-architecture`. The decision, already made: **no new service and no new module.** `selectTargets` is a pure helper in the existing `reviews` module beside the existing `helpers.ts`, called by the existing `ReviewService`; the route stays a thin parse-and-delegate. Nothing crosses a module boundary, so `pnpm arch` gains no edge. Testing the helper rather than the service is deliberate — `ReviewService`'s constructor builds a `ReviewRepository` from `container.db` and a `ReviewRunExecutor` (`service.ts:31-36`), so a service-level unit test would need a fake container for logic that is pure.
- **Gate:**
  ```
  cd server && pnpm typecheck && pnpm arch
  cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/multi-agent-targets.test.ts test/reviews-helpers.test.ts test/routes-smoke.test.ts
  ```
- **Done when:** the test asserts, each as its own case — `{agentIds:[a,b], agentId:c, all:true}` resolves to `[a,b]` and never five; `{agentIds:[a,a,b]}` resolves to two distinct agents; nine ids fail `RunRequest.parse` at the schema (the `max(8)` fuse); an id that is disabled is dropped with a reason while the rest run; an empty survivor set is a 400 and not a silent `all`.
- **Depends on:** Phase 1.

### Phase 3 — The group row (R2, C2)

- **What lands:** a multi-target run writes one `multi_agent_runs` row before queueing, stamps every member, and returns its id; a single-target run returns null and stamps nothing.
- **Files:**
  `server/src/modules/reviews/repository/run.repo.ts` — new `createMultiAgentRun(db, {workspaceId, prId}): Promise<string>`; `createAgentRun` accepts an optional `multiAgentRunId`.
  `server/src/modules/reviews/repository.ts` — the two facade methods.
  `server/src/modules/reviews/service.ts:103-140` — `runReview` creates the group row when `targets.length > 1`, passes the id into each `createAgentRun`, and returns it.
  `server/src/modules/reviews/routes.ts:43-49` — return the real `multi_agent_run_id`.
  `server/test/multi-agent.it.test.ts` — **new, DB-backed**.
- **Governing skill:** `onion-architecture`. Decision: the service owns the ordering (group row first, then N run rows) and the repository stays a set of single writes. **No transaction is introduced** — this server has historically had none, and the failure mode here is a group row with no members, which is inert and harmless, unlike a member with a dangling group id. Do not assume `createAgentRun` is atomic with anything.
- **Gate:**
  ```
  cd server && pnpm typecheck && pnpm arch
  cd server && pnpm exec vitest run test/multi-agent.it.test.ts
  ```
  (DB-backed; self-skips without Docker — if it skips, say so rather than reading a skip as a pass.)
- **Done when:** after a two-agent run, both `agent_runs` rows carry the same non-null `multi_agent_run_id`, `GET /pulls/:id/runs` returns it on each `RunSummary` with each row's own `status`, and a single-agent run leaves it null with no `multi_agent_runs` row written.
- **Depends on:** Phase 2.

### Phase 4 — Grouping, pure and hermetic (R3, N3)

- **What lands:** a function that turns per-agent findings into `FindingGroup[]` with a take for every agent in the run, and a test that pins the overlap rule.
- **Files:**
  `server/src/modules/reviews/grouping.ts` — **new**, exporting `groupFindings(input: { agent_id: string; agent_name: string | null; findings: FindingRecord[] }[]): FindingGroup[]`. Two findings join when `file` is equal **and** `a.start_line <= b.end_line && b.start_line <= a.end_line`; the group anchor is the union of member ranges; `key` is `` `${file}:${anchor_start}-${anchor_end}` ``; `title` is the highest-severity member's title (`CRITICAL > WARNING > SUGGESTION`, ties broken by the earliest `start_line` for determinism); `takes` has one entry per input agent with `finding: null` for the silent ones; `conflict` is `takes.some(flagged) && takes.some(!flagged)`.
  `server/test/multi-agent-grouping.test.ts` — **new, plain `*.test.ts`**, no DB, no model.
- **Governing skill:** `onion-architecture`. Decision: this is domain logic in the `reviews` module, a pure module-local file importing only `@devdigest/shared` types — no repository, no container, no DB, so it introduces no dependency edge and `pnpm arch` is unaffected. N2 is satisfied by construction: it takes findings that are already loaded and never re-reads the diff.
- **Gate:**
  ```
  cd server && pnpm typecheck && pnpm arch
  cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/multi-agent-grouping.test.ts
  ```
- **Done when:** the fixture from `spec:200-203` — agent A flags `ratelimit.ts:50-54`, agent B flags `ratelimit.ts:52`, agent C is silent — yields exactly one group with three takes, `conflict: true`, anchor `50-54`, and both original finding objects present by id inside their takes. Plus: same line numbers in different files never group; a `1..EOF` finding absorbs the file's other findings and the title still comes from the highest-severity member, not the widest; an agent absent from the input never appears as a take.
- **Depends on:** Phase 1 (needs `FindingGroup`). Independent of Phase 3.

### Phase 5 — Three reads: results, latest-for-repo, per-agent estimates

- **What lands:** two reads. `GET /pulls/:id/multi-agent-runs/:multiAgentRunId` returns `{runs, groups}` for a group, workspace-scoped, 404 otherwise; the route asserts the group belongs to that PR, so a group id from another PR is a 404 rather than a cross-PR read. `GET /repos/:id/multi-agent-runs/latest` returns the repo's most recent group id (or null) so R8's screen knows what to open on, and `GET /agents/estimates` returns per-agent median duration and cost for R9's picker.
- **Files:**
  `server/src/modules/reviews/repository/run.repo.ts` — `getMultiAgentRun(db, workspaceId, id)` (→ `{id, prId}` or undefined) and `listRunsForMultiAgentRun(db, workspaceId, id): Promise<RunSummary[]>`, sharing the existing `listRunsForPull` field map (`run.repo.ts:51-69`) so the two cannot drift.
  `server/src/modules/reviews/repository/review.repo.ts` — `reviewsForRunIds(db, runIds)`.
  `server/src/modules/reviews/repository/run.repo.ts` — `latestMultiAgentRunForRepo(db, workspaceId, repoId)`: `multi_agent_runs` joined to `pull_requests` on `pr_id` (`server/src/db/schema/pulls.ts:12-16`), ordered by `ran_at` desc, limit 1, returning `{id, prId, prNumber}` or undefined. Plus `agentEstimates(db, workspaceId)`: per `agent_id`, the **median** `duration_ms` and `cost_usd` over that agent's recent `agent_runs`, null where there is no history — never 0 (R9).
  `server/src/modules/reviews/repository.ts` — facade methods.
  `server/src/modules/reviews/service.ts` — `multiAgentRun(workspaceId, prId, id): Promise<MultiAgentRunView>`: resolve the group (verifying its `pr_id` matches) → runs → reviews for those run ids → agent names → `groupFindings(...)`.
  `server/src/modules/reviews/routes.ts` — one route beside the existing ones, plus its line in the header comment block (`routes.ts:13-22`).
  `server/test/multi-agent.it.test.ts` — extended.
- **Governing skill:** `onion-architecture`. Decision: route → service → repository, and **the route composes nothing** — the service calls `groupFindings` and returns the view. No new module is created, so `src/modules/index.ts` needs no entry (a module is inert until registered there; this is not one). All reads are workspace-scoped in the repository, matching `listRunsForPull` (`run.repo.ts:49`).
- **Gate:**
  ```
  cd server && pnpm typecheck && pnpm arch
  cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/routes-smoke.test.ts test/contracts.test.ts
  cd server && pnpm exec vitest run test/multi-agent.it.test.ts
  ```
- **Done when:** the route's response parses against `MultiAgentRunView`; a group from another workspace 404s; `takes` covers every run in the group including the failed and the silent ones; the response contains no finding not present in some review of that group.
- **Depends on:** Phases 3 and 4.

### Phase 6 — Move `RunTraceDrawer` to `client/src/components/` (R7)

- **What lands:** the drawer sits at `client/src/components/run-trace-drawer/`, the PR page mounts it from there, and its behaviour is byte-identical.
- **Files:**
  `git mv` the folder `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/` → `client/src/components/run-trace-drawer/` (contents unchanged, `_components/` subfolder and all).
  `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:17` — `import RunTraceDrawer from "@/components/run-trace-drawer"`.
  Two test files whose deep relative `messages/en/runs.json` import depth changes with the move: `RunTraceDrawer.test.tsx:5` (`../` × 8 → × 5) and `_components/TraceBody/TraceBody.test.tsx:5` (`../` × 10 → × 7). Everything else inside the folder is either folder-relative (`../../styles`, `../../constants`, `../../helpers`) or aliased (`@/lib/hooks/trace`, `@/lib/hooks/reviews`) and needs no edit — verified.
- **Governing skill:** `frontend-ui-architecture`. Decision already made, so do not re-derive it: a component two routes mount is promoted out of route-private `_components/` into `client/src/components/`, kebab-cased to match `diff-viewer/` and `run-cost-badge/`. **The folder's internals are not restructured** — the nested `_components/` name travels with it, because a rename would turn a mechanical move into a diff nobody can read against the original. **No second copy is forked** (`spec:271-274`).
- **Gate:**
  ```
  cd client && pnpm typecheck && pnpm test && pnpm lint
  git ls-files | grep -c RunTraceDrawer.tsx    # must print 1
  ```
- **Done when:** `git ls-files | grep -c RunTraceDrawer.tsx` prints 1, the drawer's own tests pass unmodified apart from the two import-depth fixes, the PR page still opens the drawer, and `pnpm lint` still reports **49** warnings (the measured baseline on `w8`; `CLAUDE.md`'s 43 is stale).
- **Depends on:** nothing. Do it before Phase 8, which imports the moved path.

### Phase 7 — The agent picker on `Run Review ▾` (R1 client half)

- **What lands:** checking 2 of 5 agents and clicking `Run multi-agent review (2)` issues exactly one `POST /pulls/:id/review` with `{agentIds:[a,b]}` and navigates to the results URL.
- **Files:**
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/AgentPickerPopover.tsx` — **new**; checkbox list of enabled agents, `Clear`, and a primary `Run multi-agent review ({n})` disabled at `n === 0`.
  `.../RunReviewDropdown/RunReviewDropdown.tsx` — hosts the picker section above the existing `Run all` / per-agent items, which are untouched.
  `.../RunReviewDropdown/styles.ts`, `constants.ts` — the popover's styles and width live here, not inline in the component.
  `client/src/lib/hooks/reviews.ts:120-138` — `RunReviewInput` gains `agentIds?: string[]`; the body spread gains `...(agentIds?.length ? { agentIds } : {})`.
  `client/messages/en/prReview.json` — the picker's strings (`runReview.pickAgents`, `runReview.clear`, `runReview.runMultiAgent`), because the dropdown reads `useTranslations("prReview")` (`RunReviewDropdown.tsx:34`) and N4's "no new namespace" applies to `runs.json`'s page strings, not to a control living in a `prReview` component.
  `.../RunReviewDropdown/RunReviewDropdown.test.tsx` — extended.
- **Governing skill:** `frontend-ui-architecture`. Decision, from the audit: the picker is a **new sibling component in the existing route-private folder**, not an extension of `@devdigest/ui`'s `Dropdown` — that primitive takes only `DropdownItemDef[]` and closes on every click (`client/src/vendor/ui/kit/types.ts:5`, `kit/Dropdown.tsx:5-17`), and `vendor/**` is do-not-touch. It stays route-private (one route mounts it), so it is **not** promoted to `client/src/components/`.
- **Gate:**
  ```
  cd client && pnpm typecheck && pnpm test && pnpm lint
  ```
- **Done when:** the test asserts one POST whose body is exactly `{agentIds:[a,b]}` (no `all`, no `agentId`); the run button is disabled at zero checked; checking and unchecking does not close the popover; a response with a non-null `multi_agent_run_id` routes to `/repos/:repoId/pulls/:number/multi-agent/<id>` and a null one does not navigate (`spec:329`).
- **Depends on:** Phase 1 (the client mirror carries `agentIds`). Green against a server without Phase 2 only at the type level — run it against a Phase-2 server before calling the acceptance met.

### Phase 8 — The results page: Columns, Tabs, live status (R5, R6, N4)

- **What lands:** `/repos/:repoId/pulls/:number/multi-agent/:id` renders both views from one fetch, with per-agent live status and a failure that stays inside its own column.
- **Files:**
  `client/src/app/repos/[repoId]/pulls/[number]/multi-agent/[multiAgentRunId]/page.tsx` — **new**; `view` in the URL (`?view=columns|tabs`, default `columns`).
  `.../[multiAgentRunId]/_components/AgentColumn/`, `.../AgentTabs/` — **new**, route-private.
  `client/src/lib/hooks/reviews.ts` — `useMultiAgentRun(prId, id)`, polling while any member `status === "running"`, mirroring `usePrRuns` (`reviews.ts:42-51`).
  `client/messages/en/runs.json` — reword `page.subtitle`, `page.runAll`, `page.noRun.*` per the audit's named assumption; **leave `page.meta`'s `fan-out via p-queue` exactly as it is** (N1 — it is true of this server; the mock's "worktrees" is not).
  Component tests alongside.
- **Governing skill:** `frontend-ui-architecture`. **Visual conformance is specified, not chosen:** every measurement for this screen is in `specs/14-multi-agent-review.md` → `## Design conformance` → *The results screen*, which maps each element to a line in `design-mocks/src/19-screen_multiagent.jsx`. Read the mock source, never a screenshot. Decisions: the two views are **one route with a URL-held `view` param**, not two routes — R5 requires a shared link to open what the sender saw, and a second route would duplicate the fetch. `AgentColumn` and `AgentTabs` stay route-private under `_components/` because exactly one route mounts them; the promotion threshold is a **second** route, and there is none. `RunTraceDrawer` is imported from `@/components/run-trace-drawer` (Phase 6) — **not copied**. Data comes from the single `useMultiAgentRun` query plus the existing `useRunEvents(runIds)` (`client/src/lib/hooks/reviews.ts:170`), which already subscribes N runs in parallel; no per-column `EventSource` is hand-rolled.
- **Gate:**
  ```
  cd client && pnpm typecheck && pnpm test && pnpm lint
  ```
- **Done when:** both views render from the same fetch; a member with `status: "failed"` renders its `error` inside its own column with a retry for that agent alone while sibling columns still show findings; `View trace` in each column opens the drawer with **that** column's `runId`; the accept/dismiss actions in Tabs post to the existing `POST /findings/:id/{accept,dismiss}` and the state survives a switch to Columns and back; every visible string resolves from `runs.json` with no literal left in a component.
- **Depends on:** Phases 5, 6, 7.

### Phase 9 — `Where agents disagree` (R4)

- **What lands:** the conflicts block below the results, with a working `Show only conflicts` filter and a real empty state.
- **Files:**
  `client/src/app/repos/[repoId]/pulls/[number]/multi-agent/[multiAgentRunId]/_components/ConflictsSection/` — **new**, plus its test.
  `page.tsx` — mounts it below both views.
- **Governing skill:** `frontend-ui-architecture`. Layout comes from the `Conflicts` row of the spec's `## Design conformance` table — note the takes grid draws its separators as **gap 1 over a `--border` background**, not as per-cell borders. Decision: the section renders `groups` straight off the existing `useMultiAgentRun` result and **computes nothing** — `conflict` is a server field (C3), and the filter is a local `useState` boolean over an array the query already holds. No second fetch, no client-side grouping (`spec:391-393`).
- **Done when:** on the Phase-4 fixture, `Show only conflicts` hides unanimous groups and keeps the conflicting one; a `did not flag` cell renders the muted label **alone** with no note (`spec:210-213`); a run where every agent agrees renders `conflicts.empty`, not an empty box.
- **Gate:**
  ```
  cd client && pnpm typecheck && pnpm test && pnpm lint
  ```
- **Depends on:** Phase 8.

### Phase 9b — `Compare side by side` on the PR's Agent runs tab (R11)

- **What lands:** runs that share a `multi_agent_run_id` render as one group on the PR's `Agent runs` tab, with a link into the comparison view. Runs without a group id look exactly as they do today.
- **Files:**
  `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/` (and/or `RunHistory/`, whichever renders the run cards) — a group header above the cards that share an id.
  `client/messages/en/runs.json` — two strings: the group header and `Compare side by side`.
  Component test alongside.
- **Governing skill:** `frontend-ui-architecture`. **Decisions:**
  - **No new endpoint, and no new hook.** `GET /pulls/:id/runs` already returns `RunSummary[]` and Phase 1 puts `multi_agent_run_id` on that shape, so this is a `groupBy` over data the tab already has. If the implementer finds themselves adding a fetch, C2 was not wired through — go back to Phase 1 rather than papering over it.
  - The link goes on the **`Agent runs` tab only**, never the PR header: that row already has three controls (`design-mocks/src/12-screen_pr_detail.jsx:181-185`) and a fourth that is dead whenever no group exists would be worse than none.
  - Grouping is by id and preserves the existing sort — do not reorder the tab's runs to bring group members together if they are not already adjacent; render the header at the first member and mark the rest, or the timeline stops matching the run history beside it.
- **Gate:**
  ```
  cd client && pnpm typecheck && pnpm test && pnpm lint
  ```
- **Done when:** a PR with one three-agent group and one single run shows one group header reading `3 agents` with a working link to `/repos/:repoId/pulls/:number/multi-agent/<id>`, the single run renders ungrouped, and a PR with only single runs renders byte-identically to before this phase.
- **Depends on:** Phases 1, 3 and 8 (the destination must exist before it is linked).

### Phase 10 — `Configure run`, the estimate, and the nav entry (R8, R9, R10)

- **What lands:** `/repos/:repoId/multi-agent` opens on the repo's most recent multi-agent run; `Configure run` switches to the PR-and-agents picker with a live estimate; the sidebar has a `GLOBAL` entry that resolves.
- **Files:**
  `client/src/app/repos/[repoId]/multi-agent/page.tsx` — **new**; resolves the repo's latest group and renders the results phase, or the config phase when there is none. `phase` in the URL (`?phase=config`) so `Configure run` is a shareable link and the back button works.
  `.../multi-agent/_components/RunConfig/`, `.../_components/PersonaPickCard/` — **new**, route-private, plus tests.
  `server/src/modules/reviews/` — the estimate read (R9) over each agent's recent `agent_runs`, and the "latest group for this repo" resolve.
  `client/src/lib/hooks/reviews.ts` — `useLatestMultiAgentRun(repoId)` and `useAgentEstimates()`.
  `client/messages/en/runs.json` — the config phase's strings.
  `client/src/vendor/ui/nav.ts` — one appended `GLOBAL` group with one item.
- **Governing skill:** `frontend-ui-architecture` for the screens, `onion-architecture` for the estimate read, `repo-conventions` for the vendored-file exception. **Decisions:**
  - **Every measurement is in the spec's `## Design conformance` → `Configure run` table**, mapped line by line to `design-mocks/src/19-screen_multiagent.jsx:93-149`. Note this screen is **centred at `maxWidth: 720`**, unlike the results view — that is the design's own choice, not an oversight to normalise away.
  - The estimate is a **median** over each agent's recent runs, not a mean, and an agent with no history renders `no estimate yet` rather than `~0s · $0.00`. Total time is the **max** of the selected agents, total cost their **sum** — the design computes it exactly this way (`:113-114`).
  - `Configure run` reuses the **existing** `useRunReview` mutation with `{agentIds}` and navigates on the non-null `multi_agent_run_id`, exactly as Phase 7 does. No second mutation.
  - Nav item `key` must be **`multi-agent`**: `activeKeyFor` already returns that string for any `/multi-agent` path (`client/src/components/app-shell/helpers.ts:28`) — a branch dead since it was written. Any other key silently breaks sidebar highlighting.
- **Gate:**
  ```
  cd server && pnpm typecheck && pnpm arch
  cd client && pnpm typecheck && pnpm test && pnpm lint && pnpm build
  git diff --stat client/src/vendor/ui/nav.ts
  ```
- **Done when:** arriving with an existing run renders that run's results, not a form; `Configure run` reaches the picker with the current PR preselected and the agent cards styled per the conformance table; an agent with no run history shows the absence label; a three-agent selection shows a total time near the slowest and a cost equal to the sum; `git diff client/src/vendor/ui/nav.ts` is one appended group with one item.
- **Depends on:** Phases 5, 7, 8.

### Final gate (run once, after Phase 10)

```
cd server && pnpm typecheck && pnpm arch && pnpm test
cd client && pnpm typecheck && pnpm test && pnpm lint && pnpm build
./scripts/check-shared.sh
```

## Verification matrix

| Command | Package | What it proves |
| --- | --- | --- |
| `pnpm db:generate && pnpm db:migrate` | `server/` | One generated migration, applied; no hand edit, no renumber. |
| `pnpm typecheck` | `server/` | Contract changes reached every consumer, including the `RunSummary` field map at `run.repo.ts:51-69`. |
| `pnpm arch` | `server/` | Still 11 violations — grouping and the new route added no dependency edge. Baseline never regenerated. |
| `pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/multi-agent-grouping.test.ts` | `server/` | N3: grouping is pure — the overlap rule, silent takes, the conflict flag, no DB. |
| `pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/multi-agent-targets.test.ts` | `server/` | C1 precedence, de-duplication, the `max(8)` fuse, and that a malformed `agentIds` is a 400 rather than a 500. |
| `pnpm exec vitest run test/multi-agent.it.test.ts` | `server/` | R2 over real rows: one shared non-null group id, null on the single-agent path, and the read route's shape. Skips without Docker — a skip is not a pass. |
| `pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/contracts.test.ts test/routes-smoke.test.ts` | `server/` | Contracts still parse; the new route registers and the existing ones did not move. |
| `pnpm test` (unfiltered) | `server/` | End-of-run only: the 15 `*.it.test.ts` files against testcontainers Postgres. Not on every phase. |
| `pnpm typecheck && pnpm test` | `client/` | The picker body, the drawer move, both views, the conflicts filter. |
| `pnpm lint` | `client/` | Still **49** warnings — nothing new, nothing `--fix`ed. Measured on `w8`, 2026-08-28; `CLAUDE.md` still says 43 and is stale, so trust the measurement, not the doc. |
| `pnpm build` | `client/` | The new App Router route compiles. |
| `./scripts/check-shared.sh` | root | The two vendored copies are identical — the client side was mirrored, never hand-edited. |
| `git ls-files \| grep -c RunTraceDrawer.tsx` | root | R7: exactly one copy of the drawer in the repo. |
| `git diff --stat client/src/vendor/ui/nav.ts` | root | R9: the vendored exception stayed one group with one item. |

## Traps for this change

- **`server/clones/**` holds a full copy of this repository.** Every grep and glob must exclude it, or the implementer will read and edit `clones/**/run-executor.ts` and wonder why nothing changed.
- **`multi_agent_runs` looks ready and is not** (`server/INSIGHTS.md:145`). Until Phase 1's column lands, nothing can point at it. Never backfill the column for historical rows.
- **Exactly one migration on this branch.** The latest on `w8` is `0017_amusing_chimera.sql`; this produces `0018`. Spec 15 v1 generates **no** migration, so there is no collision and no imposed merge order — but that is true only while B stays migration-free. Do not generate a second migration in a later phase, and never hand-edit `meta/_journal.json` or a snapshot.
- **Never hand-edit `client/src/vendor/shared/`.** Only `./scripts/check-shared.sh --fix` writes it. Five files silently drifted the last time this rule was broken (`INSIGHTS.md:441`).
- **`client/src/vendor/ui/**` is do-not-touch, with exactly one exception: `nav.ts` in Phase 10**, one group with one item. In particular, `kit/Dropdown.tsx` and `kit/types.ts` are **not** widened to support checkbox items.
- **pnpm vs npm.** `server/` and `client/` are pnpm; this feature touches nothing under `reviewer-core/`, `e2e/` or `mcp/`, so npm should not appear anywhere in this run.
- **The baselines are quiet, not clean.** `pnpm arch` exits 0 against 11 known violations and `pnpm lint` against **49** warnings — measured 2026-08-28 on `w8`, not the 43 `CLAUDE.md` still claims. Regenerating either, or `lint --fix`ing a pre-existing warning, is a defect in this feature even though the gate goes green.
- **No transactions on this server.** The group row and its member rows are separate writes; do not assume `createAgentRun` is atomic with `createMultiAgentRun`, and do not introduce a transaction to make it so.
- **`page.meta`'s `fan-out via p-queue` is correct** (`server/src/platform/jobs.ts:42`, concurrency 3). Do not "fix" it to the mock's `fan-out via worktrees` (N1, `INSIGHTS.md:225`).
- **Worktree boundary.** Do not create `ci/` or `agent-runner/`, do not touch `client/messages/en/ci.json` (it already exists, fully seeded, and belongs to spec 15), and do not touch `server/src/modules/agents/**`.
- **`e2e/` flows already send `{all}` and `{agentId}`.** C1 is additive precisely so they keep passing byte-for-byte; if an e2e flow breaks, the precedence logic is wrong, not the flow.

## Risks and unknowns

- ~~The read-route envelope is my assumption.~~ **Resolved:** nested under the PR, `MultiAgentRunView` without `pr_id`, spec updated.
- **`Run all agents` on the results page** — assumed removed, strings reworded in Phase 8. If the CTO answers the other way, the change is confined to `runs.json` and one button in `page.tsx`. Cheap either way; the reason it is flagged is that it is a product call, not mine.
- **`selectTargets` may not be cleanly extractable if `resolveTargets` grows a repository read per id.** If a per-id `getById` loop is needed for unknown-id detection, the helper takes a pre-fetched map (as specified) and the service does the fetching — 15 minutes to confirm against `agentsRepo.listEnabled` / `getById`.
- **Unknown: whether a malformed `agentIds` currently surfaces as 400 or 500.** `RunRequest.parse` throws a `ZodError` inside the handler (`routes.ts:39`) and I did not trace the Fastify error hook. Phase 2's test pins whichever it is and fixes it if it is 500 — 20 minutes to check.
- **Unknown: how the `it.test.ts` harness seeds agents and reviews.** If `reviews.it.test.ts` has no reusable fixture for two agents on one PR, Phase 3 pays for building one. Read `server/test/reviews.it.test.ts` and `test/helpers/` before starting Phase 3.
- **`useRunEvents` resets its accumulated events whenever the `runIds` array changes** (`client/src/lib/hooks/reviews.ts:174-177`, keyed on `runIds.join(",")`). If Phase 8 derives the id list from a polling query whose array identity changes, the live log will clear on every poll. Memoise the id list on a content signature — this is the same class of bug as the reorder trap in `client/INSIGHTS.md:225`.

## Recommendations

*Not in the plan above. A human decides whether the spec changes.*

1. ~~**The read-route envelope.**~~ **Settled after this plan was written:** the route is nested under the PR (`/pulls/:id/multi-agent-runs/:id`), so `MultiAgentRunView` drops `pr_id` and the `?pr=` query-param alternative is moot. The spec was updated to match.
2. **Cap the picker in the UI at 8 too.** The `max(8)` fuse currently surfaces as a Zod parse failure — a red toast after the user has checked nine boxes. Disabling the ninth checkbox with a hint costs five lines in `AgentPickerPopover` and is a strictly better failure. Not in the plan because `spec:102-104` explicitly calls `max(8)` a cost fuse and not a UI limit; this does not remove the fuse, it just stops the user hitting it.
3. **Fix the Pull Requests list's FINDINGS column while the context is loaded.** `INSIGHTS.md:279-286` records that it uses latest-row scoping and is wrong for exactly the multi-agent runs this feature creates — it will now be wrong more often, and visibly so. Out of the owned file set (`server/src/modules/pulls/routes.ts:126`), so it is a separate task, but it is the first thing a user will notice after shipping this.
4. **Answer open question 1 before the next spec revision.** "Re-run these 3 again" is one button and one POST once `multi_agent_run_id` exists, and it is much cheaper to add now than to retrofit a re-run relationship between two groups later.

### Post-implementation review sequence

Run **`architecture-reviewer` first, then `plan-verifier`**, and skip neither. Reversing them wastes tokens: `plan-verifier` reads finished code against every plan item, so if a layering fix moves a file, its evidence is stale and the pass is repeated.

- **`architecture-reviewer` — scope it to the diff, both packages, in one pass.** Server-side it is checking things this plan cannot prove with a command: that `groupFindings` stayed pure and module-local, that the new route is thin and the service owns composition, and that no new cross-module edge slipped in (`pnpm arch` catches the edges it has rules for — 8 rules, 11 baselined violations — but not "this route is doing service work"). Client-side it is the placement calls: `run-trace-drawer` promoted correctly, `AgentPickerPopover` and the results-page components correctly **not** promoted, and no second drawer. The client has no machine enforcement at all, so this is the only check those decisions ever get. **What it misses:** behaviour. It will not notice that `Show only conflicts` filters the wrong array or that the SSE list resets on every poll.
- **`plan-verifier` — scope it to R1-R7, C1-C3 and N1-N5, one verdict per item with evidence.** This is the pass that catches a phase quietly dropped: the `did not flag` cell rendering an invented note, `takes` omitting silent agents, a `Run all` string left describing a feature that no longer works that way, a second `0018` migration, or `page.meta` "corrected" to the mock's wording. It is also the only check on the two audited assumptions above actually being implemented as assumed rather than as the spec's literal text.
- **Skip neither, but if only one budget exists, keep `plan-verifier`.** This feature's risk is concentrated in *quietly not doing things* — silent takes, the merge order, the vendored one-line exception, the three deliberate cuts — and a per-item verdict finds those. The architecture risk is comparatively contained: the server side is inside one existing module with `pnpm arch` watching the edges, and the client placement calls were made in this plan rather than left open, so the reviewer is confirming decisions rather than discovering them.
- **`/security-review`: not worth it here** unless the implementer deviates. The feature adds no new auth surface, no new secret, and no user-supplied string reaching a shell or a query builder — the one thing worth a manual look is that `getMultiAgentRun` and `listRunsForMultiAgentRun` are workspace-scoped in the repository, which is already a Phase-5 done-when.

## Out of scope for the implementer

- Architecture review — a separate agent, run after Phase 9.
- Security review — a separate agent.
- Regenerating the `arch` or `lint` baseline, under any circumstances.
- Deciding whether `Run all agents` survives on the results page — a product call, flagged in the audit and assumed, not settled.
- The two spec open questions (`spec:421-427`).
- The Pull Requests list's FINDINGS scoping bug (`INSIGHTS.md:279`).
- Anything in spec 15's worktree: `ci/`, `agent-runner/`, `client/messages/en/ci.json`.
- The `engineering-insights` write-up at the end of the run — required by `AGENTS.md`, but it is a step for whoever closes the task, not a phase.
