# Multi-Agent Review — Remediation Plan (round 1 of 2)

**Spec:** `specs/14-multi-agent-review.md` (the plan under remediation is
`plans/14-multi-agent-review.plan.md`; the code under remediation is commit
`4749c3e` on `feat/multi-agent-review`, worktree
`/Users/alexlavre/Documents/my-dev-digest/devdigest-review`).
**Execution mode:** single implementer

Four confirmed findings, four phases, nothing else. Every phase quotes its
finding and makes the smallest fix the reviewer named. Findings marked
*considered and not a finding*, and anything not in the four items below, are
**out of scope for this round** — do not fold them in.

## Goal / Done when

The four confirmed findings are closed: `FindingCard` lives at one shared path
imported by both routes, the two remaining multi-agent GET responses have Zod
contracts in `@devdigest/shared` instead of hand-written client interfaces, the
Configure-run screen renders an error state for every hook it consumes, and a
failed agent column actually renders a working Retry.

## Requirement audit

| Requirement | Problem | Effect on this plan |
| --- | --- | --- |
| Finding 4 — "the retry should re-run that one agent through the existing `useRunReview` mutation with a single-element `agentIds`" | The resulting run is a **single-target** run, so `server/src/modules/reviews/service.ts:139-140` gives it `multiAgentRunId: null`. It is therefore not a member of this group, and `service.multiAgentRun` (`service.ts:219-223`, via `listRunsForMultiAgentRun`) will never return it. Neither the spec (`specs/14-multi-agent-review.md:246-250`) nor the original plan (`plans/14-multi-agent-review.plan.md:236`) says where the retry's *result* is supposed to appear. | **Assumed** (Phase 4, stated in full there): the retry starts a standalone run and the results page does **not** navigate; it opens `RunTraceDrawer` on the new run id so the retry is watchable in place. The failed column keeps showing its original error — by construction, not by bug. Making the retry rejoin the group is a server + contract change and is **not** in this round. |
| Finding 3 — "match that pattern" for `useAgentEstimates` | `usePulls` and `useAgents` are load-bearing (no PRs / no agents ⇒ the form cannot be filled). The estimate is decorative; the hook's own doc (`client/src/lib/hooks/reviews.ts:88-90`) says an absent agent renders `no estimate yet`. Gating the whole screen on it is a judgement call the reviewer did not spell out. | **Assumed:** all three are gated, matching `client/src/app/repos/[repoId]/pulls/page.tsx:113-118` literally, because a picker that silently drops the cost estimate misstates R9. One-line reversal if the CTO disagrees — see Risks. |

No other problems found in the four items.

## Context read

| Source | What it settled |
| --- | --- |
| `.claude/skills/frontend-ui-architecture/SKILL.md` — *Where does it go?* | "UI used by two or more routes → `src/components/<kebab-name>/`". Confirms Phase 2's target folder **and its kebab casing**: `client/src/components/finding-card/`, matching the `run-trace-drawer` promotion in this same commit. |
| Same skill — *Before you finish*, checks 5 and 6 | "No API type was redeclared that `@app/shared` already exports" (Phase 1) and "Every new data-consuming component renders a loading and an error state" (Phase 3). Both findings are this skill's own checklist, not new policy. |
| `server/src/modules/reviews/service.ts:139-140` | `const multiAgentRunId = targets.length > 1 ? await this.repo.createMultiAgentRun(...) : null` — a one-agent retry is never grouped. This is the fact Phase 4 is built around. |
| `server/src/modules/reviews/routes.ts:172` and `:183` | `schema: { params: IdParams, response: { 200: PrIntentRecord.nullable() } }` — response schemas are already the pattern in this exact file, and `server/src/app.ts:64-65` wires `fastify-type-provider-zod`'s validator/serializer. Phase 1 follows it rather than inventing anything. |
| `server/test/multi-agent.it.test.ts:270-320` | Both routes Phase 1 touches are already exercised end-to-end (`latest` returns `null` then the group; `estimates` returns rows). Phase 1's schemas get a real gate for free. |
| `client/src/lib/hooks/index.ts:67` | The hooks barrel re-exports only `ActiveRun`, `CreateCommentInput`, `RunReviewInput` — **not** `LatestMultiAgentRun` / `AgentEstimate`. Deleting those two interfaces touches only the three files that import them directly. |
| `client/src/app/repos/[repoId]/pulls/page.tsx:113-118` | The `isLoading → isError(ErrorState + refetch) → empty → data` ladder Phase 3 copies. |
| `scripts/check-shared.sh:7-15` | `server/src/vendor/shared` is canonical; the client copy is produced by `--fix`, never hand-edited. Binds Phase 1. |

## Prior art and rejected approaches

- `plans/14-multi-agent-review.plan.md:16-19` — the original audit's named assumptions
  (`Run all` stays in the dropdown only; the picker is a sibling popover, not a
  widened vendored `Dropdown`). Unchanged by this round; do not revisit them.
- `plans/14-multi-agent-review.plan.md:328` — `client/src/vendor/ui/**` is do-not-touch.
  No phase here goes near it.
- `plans/14-multi-agent-review.plan.md:343` — `useRunEvents` resets its accumulated
  events whenever the joined `runIds` string changes. Phase 4 must not add the
  retry's run id into the array passed to `useRunEvents` (`page.tsx:46-47`) —
  doing so clears every column's live log. The drawer subscribes on its own.
- No INSIGHTS entry rejects any of the four fixes. `client/INSIGHTS.md` and the
  root `INSIGHTS.md` contain nothing about component promotion or about typing a
  GET response, and `server/INSIGHTS.md`'s note on the group row (quoted at
  `service.ts:137-139`) is consistent with Phase 4's reading.

## Scope

**In:**
- Promote `FindingCard/` to `client/src/components/finding-card/`; fix both import sites.
- Add `LatestMultiAgentRun` and `AgentEstimate` Zod contracts to `@devdigest/shared`; consume them on both sides; delete the client-local interfaces.
- Add loading/error gating for `usePulls`, `useAgents`, `useAgentEstimates` on the Configure-run page.
- Wire `onRetry` from the results page into `AgentColumn`.

**Out:**
- Any change that makes a retried run rejoin its multi-agent group (contract + server + grouping — a spec question, not a defect fix).
- Any other Zod-ifying, any other promotion, any other error-state audit anywhere in `client/`.
- Introducing the first `page.test.tsx` in `client/src/app` (there are none: `find client/src/app -name "page.test.tsx"` returns nothing). Phases 3 and 4 add no page test; see *Risks*.
- Touching `AgentColumn.tsx` or `AgentColumn.test.tsx` — the component and its test are already correct; the defect is only that nobody passes `onRetry`.
- The hardcoded English literals on the results page (`page.tsx:89-91`). Real, not one of the four.
- Regenerating either baseline.

## Contract changes

Both new shapes go in the **canonical** copy,
`server/src/vendor/shared/contracts/review-api.ts`, appended after
`MultiAgentRunView` (which ends at `:100`), then mirrored to the client with
`./scripts/check-shared.sh --fix`. The barrel already does
`export * from './contracts/review-api.js'` (`server/src/vendor/shared/index.ts:18`),
so no barrel edit is needed.

```ts
/**
 * Served by `GET /repos/:id/multi-agent-runs/latest` — the repo's most recent
 * group, or `null` when it has none (a state, not an error). camelCase because
 * that is what the query already returns
 * (`repository/run.repo.ts:115-132`); do not "normalise" it to snake_case
 * without changing the reader in the same commit.
 */
export const LatestMultiAgentRun = z.object({
  id: z.string(),
  prId: z.string(),
  prNumber: z.number().int(),
});
export type LatestMultiAgentRun = z.infer<typeof LatestMultiAgentRun>;

/**
 * Served by `GET /agents/estimates` — one row per agent that has at least one
 * `done` run. `null` (never `0`) where a metric has no history: an absence and
 * a zero are different claims (R9). Not `.int()` on the duration: the median of
 * an even-sized sample is a mean of two values (`run.repo.ts:161-166`).
 */
export const AgentEstimate = z.object({
  agent_id: z.string(),
  median_duration_ms: z.number().nullable(),
  median_cost_usd: z.number().nullable(),
});
export type AgentEstimate = z.infer<typeof AgentEstimate>;
```

Consumers that follow: `server/src/modules/reviews/service.ts:250-264` (return
types), `server/src/modules/reviews/routes.ts:129-138` (`response` schemas),
`client/src/lib/hooks/reviews.ts:66-95` (interfaces deleted, types imported),
and the three client files that import `AgentEstimate` from the hook file.

## Phases

### Phase 1 — Contracts for the two untyped GET responses (finding 2, medium)

- **Finding:** "`client/src/lib/hooks/reviews.ts:65` (`LatestMultiAgentRun`) and `:78` (`AgentEstimate`) are plain TS interfaces declared in the hook file, consumed structurally from two untyped GET responses… Every other new response shape in this commit got a Zod schema in `contracts/review-api.ts`."
- **What lands:** both endpoints are described by a Zod schema in `@devdigest/shared`, the server serializes through it, and the client imports the type instead of declaring one.
- **Files:**
  - `server/src/vendor/shared/contracts/review-api.ts` — append the two schemas exactly as written in *Contract changes* above.
  - `client/src/vendor/shared/contracts/review-api.ts` — **not hand-edited**; produced by `./scripts/check-shared.sh --fix`.
  - `server/src/modules/reviews/service.ts` — import the two types alongside the existing `MultiAgentRunView` import (`service.ts:2`); replace the inline structural return type at `:250-255` with `Promise<LatestMultiAgentRun | null>` and at `:260-264` with `Promise<AgentEstimate[]>`. Leave the bodies alone.
  - `server/src/modules/reviews/routes.ts` — `:129` becomes `{ schema: { params: IdParams, response: { 200: LatestMultiAgentRun.nullable() } } }`; `:135` becomes `{ schema: { response: { 200: z.array(AgentEstimate) } } }`. Import the two schemas (as values, not `import type`) and `z` if it is not already imported in this file.
  - `client/src/lib/hooks/reviews.ts` — delete the `LatestMultiAgentRun` interface (`:66-70`) and the `AgentEstimate` interface (`:82-86`); add both to the existing `import type { … } from "@devdigest/shared"` block at `:9-19` (keep it alphabetical). Keep the doc comments that sit above the two hooks — they explain the null-vs-zero rule and are not duplicated in the schema comments.
  - `client/src/app/repos/[repoId]/multi-agent/helpers.ts:1`, `client/src/app/repos/[repoId]/multi-agent/_components/PersonaPickCard/PersonaPickCard.tsx:9`, `client/src/app/repos/[repoId]/multi-agent/_components/RunConfig/RunConfig.tsx:11` — change `import type { AgentEstimate } from "@/lib/hooks/reviews"` to `import type { AgentEstimate } from "@devdigest/shared"`.
  - `client/src/lib/hooks/index.ts` — **no change**; it never re-exported these two types (`index.ts:67`).
- **Governing skill:** `onion-architecture`. The decision is already made, do not re-derive it: **no new module, no new service, no container wiring, no new dependency edge.** The shapes join the file A2 already owns (`contracts/review-api.ts`), the service keeps its existing shape and only swaps its declared return type for the shared one — which it already does for `MultiAgentRunView` at `service.ts:2` — and the routes gain a `response` schema exactly as `routes.ts:172` already has one. `pnpm arch` must stay at its **10-entry** baseline; if it moves, you added an edge that was not asked for.
- **Gate:**
  ```
  cd server && pnpm typecheck
  cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts'
  cd server && pnpm arch
  cd server && pnpm exec vitest run test/multi-agent.it.test.ts     # needs Docker; self-skips without it
  ./scripts/check-shared.sh --fix && ./scripts/check-shared.sh
  cd client && pnpm typecheck && pnpm test && pnpm lint
  ```
- **Done when:** `grep -n "interface LatestMultiAgentRun\|interface AgentEstimate" client/src/lib/hooks/reviews.ts` prints nothing; `diff -rq client/src/vendor/shared server/src/vendor/shared` is silent; `server/test/multi-agent.it.test.ts:270` and `:306` pass **unmodified** with the response schemas in place (proving the serializer accepts the real payload, including the `null` body at `:276`); `pnpm arch` reports 10 entries and `client pnpm lint` reports 49 warnings.
- **Depends on:** nothing.

### Phase 2 — Promote `FindingCard` out of the sibling route (finding 1, medium)

- **Finding:** "`…/multi-agent/[multiAgentRunId]/_components/AgentTabs/AgentTabs.tsx:10` imports `FindingCard` out of a *sibling route's* private `_components/` folder… the same commit already promoted `RunTraceDrawer` for exactly this reason."
- **What lands:** exactly one `FindingCard.tsx` in the tree, at a shared path, imported by both routes; `_components/` folders are private again.
- **Files:**
  - `git mv "client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard" client/src/components/finding-card` — moves all six files (`FindingCard.tsx`, `FindingCard.test.tsx`, `constants.ts`, `helpers.ts`, `index.ts`, `styles.ts`). Use `git mv`, not copy-and-delete, so the history follows the file as it did for `run-trace-drawer`.
  - `client/src/components/finding-card/FindingCard.tsx:28` — `import { githubBlobUrl } from "../../../../../../../lib/github-urls"` → `from "@/lib/github-urls"`. The alias, not a shorter relative path: that is what the promoted `RunTraceDrawer` does (`client/src/components/run-trace-drawer/RunTraceDrawer.tsx:12-13`).
  - `client/src/components/finding-card/FindingCard.test.tsx:5` — `import messages from "../../../../../../../../messages/en/prReview.json"` → `"../../../messages/en/prReview.json"`, matching `run-trace-drawer/RunTraceDrawer.test.tsx:5`. Nothing else in the test changes.
  - `client/src/app/repos/[repoId]/pulls/[number]/multi-agent/[multiAgentRunId]/_components/AgentTabs/AgentTabs.tsx:10` → `import { FindingCard } from "@/components/finding-card";`
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:9` — `import { FindingCard } from "../FindingCard"` → `from "@/components/finding-card"`.
  - `client/src/components/diff-viewer/constants.ts:26` — a comment that cites `FindingCard/constants.ts`; update the path it names. Comment only, no code.
  - `index.ts` keeps its current body verbatim (`export { FindingCard, FindingCard as default } from "./FindingCard";`) — named re-exports, no `export *`.
- **Governing skill:** `frontend-ui-architecture`. Decision already made: the folder goes to `client/src/components/finding-card/` — **kebab-case**, per the skill's *Where does it go?* row "UI used by two or more routes → `src/components/<kebab-name>/`" and per `run-trace-drawer` in this same commit. Do not use `FindingCard/` because `EvalCaseEditor/` exists; that is a known older deviation, not the convention. The component keeps `useTranslations("prReview")` and its strings stay in `messages/en/prReview.json` — a shared component reading a feature namespace is existing precedent (`client/src/components/EvalCaseEditor/EvalCaseEditor.tsx:70`). No file is split, no props change.
- **Gate:**
  ```
  cd client && pnpm typecheck && pnpm test && pnpm lint
  git ls-files | grep -c 'FindingCard\.tsx$'                 # must print 1
  git ls-files | grep 'finding-card\|FindingCard' | sed 's|/[^/]*$||' | sort -u   # must print only client/src/components/finding-card
  grep -rn '_components/FindingCard' client/src               # must print nothing
  ```
- **Done when:** the four gate commands above hold; `FindingCard.test.tsx` passes with **only** its import-depth line changed; the PR page's findings panel and the multi-agent Tabs view both still compile against the same module; `pnpm lint` still reports 49 warnings.
- **Depends on:** nothing. Independent of Phase 1 — but if both are in flight, land Phase 1 first so `check-shared` runs against a settled tree.

### Phase 3 — Error states for every hook the Configure-run page consumes (finding 3, low)

- **Finding:** "`client/src/app/repos/[repoId]/multi-agent/page.tsx:28-31` consumes four data hooks but only gates loading/error on `useLatestMultiAgentRun`; `usePulls`, `useAgents` and `useAgentEstimates` fall back silently to `?? []` with no `isError` handling."
- **What lands:** a failed `usePulls` / `useAgents` / `useAgentEstimates` on `/repos/:repoId/multi-agent?phase=config` renders the same `ErrorState` with a working retry that `/repos/:repoId/pulls` renders, instead of an empty picker.
- **Files:**
  - `client/src/app/repos/[repoId]/multi-agent/page.tsx`
    - `:28-31` — destructure `isLoading`, `isError`, `error`, `refetch` from all four hooks (name them apart: `pullsLoading` / `pullsError`, etc.).
    - `:73` — widen the skeleton condition to `latestLoading || pullsLoading || agentsLoading || estimatesLoading || !showConfig`.
    - After the skeleton branch and before the `RunConfig` return, add the error branch, copied in shape from `client/src/app/repos/[repoId]/pulls/page.tsx:113-118`:
      ```tsx
      const anyError = pullsIsError || agentsIsError || estimatesIsError;
      const firstError = pullsError ?? agentsError ?? estimatesError;
      if (anyError) {
        return (
          <AppShell crumb={crumb}>
            <ErrorState
              fullScreen
              title={t("page.errorTitle")}
              body={firstError instanceof ApiError ? firstError.message : t("page.errorBody")}
              onRetry={() => {
                if (pullsIsError) void refetchPulls();
                if (agentsIsError) void refetchAgents();
                if (estimatesIsError) void refetchEstimates();
              }}
            />
          </AppShell>
        );
      }
      ```
      `ErrorState` comes from `@devdigest/ui` (already imported alongside `Skeleton` on `:11` — add it there); `ApiError` from `@/lib/api` (new import, same specifier the results page uses at `page.tsx:15`).
    - Leave `useLatestMultiAgentRun`'s existing handling and the redirect effect (`:48-52`) exactly as they are — `latest` legitimately resolves to `null`, and this phase must not turn that into an error.
  - `client/messages/en/runs.json` — add two keys under `page`: `"errorTitle": "Couldn't load this screen"` and `"errorBody": "The pull requests and agents for this repo could not be loaded."`. Two new strings, no new namespace; `en` is the only locale (`client/messages/` holds only `en/`).
- **Governing skill:** `frontend-ui-architecture`. The rule is the skill's own check 6 — "Every new data-consuming component renders a loading and an error state" — and its *Loading and error states are the component's job* paragraph: handle it beside the query, do **not** add `error.tsx` or `loading.tsx` (explicitly "Not used" in the settled-decisions table). No new component; the branch lives in `page.tsx` next to the hooks.
- **Gate:**
  ```
  cd client && pnpm typecheck && pnpm test && pnpm lint
  grep -n 'isError' 'client/src/app/repos/[repoId]/multi-agent/page.tsx'   # must show pulls, agents and estimates
  ```
- **Done when:** the page has no `?? []` fallback that is reached while its query is in an error state; `pnpm typecheck`, `pnpm test` and `pnpm lint` (49 warnings) are green; no literal user-facing string was added to a component — both new strings resolve from `runs.json`.
- **Depends on:** nothing. Order it after Phase 1 to avoid a merge collision in `reviews.ts` imports, though the two do not overlap in this file.

### Phase 4 — A failed column's Retry actually retries (finding 4, medium, behavioural)

- **Finding:** "`AgentColumn.tsx:45-51` implements a per-agent retry button and `AgentColumn.test.tsx:67-80` tests it, but the results page never passes `onRetry` (`…/multi-agent/[multiAgentRunId]/page.tsx:143-148` passes only `run`, `findings`, `color`, `onViewTrace`). So a failed column renders its error with no retry." Phase 8's done-when (`plans/14-multi-agent-review.plan.md:236`) requires "a retry for that agent alone".
- **What the resulting run is — read this before writing the handler.** `POST /pulls/:id/review` with a single-element `agentIds` is a single-target run, and `server/src/modules/reviews/service.ts:139-140` only creates a group row when `targets.length > 1`. So the response's `multi_agent_run_id` is **null by construction**, the new `agent_runs` row carries `multi_agent_run_id = null`, and `service.multiAgentRun` (`service.ts:219-223`) — which lists members via `listRunsForMultiAgentRun` — will **never** return it. Consequences, all deliberate:
  1. There is **nothing to navigate to**. The two existing call sites guard on a non-null id (`AgentPickerPopover.tsx:70-74`, `client/src/app/repos/[repoId]/multi-agent/page.tsx:66-68`); here the guard would always fail, so this call site simply does not navigate. Do not invent a destination.
  2. Refetching `useMultiAgentRun` will **not** make the column go green. The failed column keeps showing its original error. That is correct behaviour for this round, not a stale-cache bug — do not add an `invalidateQueries` for `["multi-agent-run", …]` to "fix" it.
  3. The retry is therefore made visible **in place**: on success, open the existing `RunTraceDrawer` on the new run id, which already renders a still-running run live.
- **What lands:** a `failed` column shows a Retry button; clicking it issues exactly one `POST /pulls/:id/review` with `{agentIds:[<that agent>]}` and opens the trace drawer on the returned run id, while every sibling column keeps its findings and its live log.
- **Files:** `client/src/app/repos/[repoId]/pulls/[number]/multi-agent/[multiAgentRunId]/page.tsx` **only**.
  - Add `useRunReview` to the existing `@/lib/hooks/reviews` import (`:13`) and `const retry = useRunReview();` beside the other hooks.
  - Add `const [retried, setRetried] = React.useState<{ run_id: string; agent_name: string | null } | null>(null);`
  - Add the handler (above the `return`, after `entries` is computed):
    ```tsx
    async function onRetry(run: RunSummary) {
      if (!prId || !run.agent_id || retry.isPending) return;   // one at a time; a deleted agent cannot be retried
      const res = await retry.mutateAsync({ prId, agentIds: [run.agent_id] });
      const newRunId = res.runs[0]?.run_id;
      if (!newRunId) return;
      // Single target ⇒ res.multi_agent_run_id is null and the run is NOT in this
      // group (service.ts:139-140). Nothing to navigate to; show it in place.
      setRetried({ run_id: newRunId, agent_name: run.agent_name ?? null });
      setParam("trace", newRunId);
    }
    ```
    `RunSummary` is already imported? It is not — add `import type { RunSummary } from "@devdigest/shared";`.
  - `:143-148` — pass `onRetry={e.run.agent_id ? () => void onRetry(e.run) : undefined}`. The prop is optional and `AgentColumn.tsx:47` already renders no button when it is absent, so a deleted agent (nullable `agent_id`, `on delete set null`) correctly gets an error with no Retry. **`AgentColumn.tsx` and `AgentColumn.test.tsx` are not edited.**
  - `:169-178` — the drawer's `agentName` / `running` lookups key off `runs`, which will not contain the retried id. Fall back to `retried`:
    ```tsx
    agentName={runs.find((r) => r.run_id === traceRunId)?.agent_name ?? (retried?.run_id === traceRunId ? retried.agent_name : null)}
    running={runs.find((r) => r.run_id === traceRunId)?.status === "running" || retried?.run_id === traceRunId}
    ```
    `findings` already degrades correctly to `[]` via `?? []` at `:173`.
  - **Do not** add the retried run id to `runIds` at `:46-47`. `useRunEvents` resets its accumulated events whenever the joined id string changes (`client/src/lib/hooks/reviews.ts:219-224`, keyed on `runIds.join(",")`), so appending would wipe every column's live log — the trap already recorded at `plans/14-multi-agent-review.plan.md:343`. The drawer runs its own subscription.
  - No new strings: `runs.json:3` already has `"retry": "Retry"`, which is what `AgentColumn.tsx:49` reads.
- **Governing skill:** `frontend-ui-architecture`. Decisions, already made: the handler stays **in the page** — it needs the mutation hook, so it is not a `helpers.ts` candidate (helpers import no React); no new component and no promotion, because nothing gained a second consumer; the drawer stays URL-param state via the existing `setParam("trace", …)` (`page.tsx:61`), which is the skill's *overlays are state, not routes* middle ground and is already how `View trace` works. No `useEffect` is added.
- **Gate:**
  ```
  cd client && pnpm typecheck && pnpm test && pnpm lint
  grep -n 'onRetry' 'client/src/app/repos/[repoId]/pulls/[number]/multi-agent/[multiAgentRunId]/page.tsx'   # must print the prop being passed
  grep -n 'useRunEvents(runIds)' 'client/src/app/repos/[repoId]/pulls/[number]/multi-agent/[multiAgentRunId]/page.tsx'  # must be unchanged
  ```
  Manual, once, because there is no page-test harness in this repo (see *Risks*): `./scripts/dev.sh`, run two agents on a PR with one agent pointed at an invalid model id, then on the results page confirm the failed column shows Retry, that clicking it opens the trace drawer on a **new** run id, and that the sibling column still shows its findings.
- **Done when:** `AgentColumn.test.tsx` passes **unmodified**; the page passes `onRetry` for every column whose `run.agent_id` is non-null and omits it otherwise; clicking Retry issues exactly one POST with a single-element `agentIds` and performs no `router.push`; the sibling columns' findings and live logs are unchanged after a retry.
- **Depends on:** nothing. Land it last so the manual check runs against the finished tree.

## Verification matrix

| Command | Package | What it proves |
| --- | --- | --- |
| `pnpm typecheck` | `server/` | The two new schemas type-check and the service's declared return types match the repository's actual rows. |
| `pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts'` | `server/` | The hermetic suite is unaffected by Phase 1. |
| `pnpm exec vitest run test/multi-agent.it.test.ts` | `server/` | The Fastify Zod serializer accepts the real payloads of both routes — including the `null` body — against a real Postgres. Self-skips without Docker; it has not been run if Docker was down. |
| `pnpm test` | `server/` | End-of-run only: the whole suite including all 15 `*.it.test.ts` files. Pulls up testcontainers Postgres — do not put this on a phase gate. |
| `pnpm arch` | `server/` | No new cross-module edge. Baseline on this branch is **10** entries; never regenerate it. |
| `pnpm build` | `server/` | End-of-run only. |
| `./scripts/check-shared.sh` | repo root | The two vendored `@devdigest/shared` copies are identical after Phase 1 — the only gate that catches a hand-edited client contract. |
| `pnpm typecheck` | `client/` | The promoted import paths, the deleted interfaces and the new `onRetry` prop all resolve. |
| `pnpm test` | `client/` | `FindingCard`, `AgentColumn`, `AgentTabs`, `ConflictsSection` tests pass with only Phase 2's one import-depth change. |
| `pnpm lint` | `client/` | Baseline on this branch is **49** warnings, 0 errors. Green means no new warning; never `--fix` the baseline. |
| `pnpm build` | `client/` | End-of-run only: the moved component and the new page branches survive a production build. |
| `git ls-files \| grep -c 'FindingCard\.tsx$'` | repo root | Exactly one copy of the promoted component — the same check Phase 6 of the original plan used for `RunTraceDrawer`. |
| `./scripts/dev.sh` + the manual retry walkthrough | repo root | Phase 4's behaviour, which no automated gate in this repo covers. |

## Traps for this change

- **`server/clones/**` holds a full copy of this repository.** Exclude it from every grep and glob or you will edit the wrong `FindingCard.tsx` — and the `git ls-files | grep -c` gate would then be meaningless.
- **`client/src/vendor/shared` is never hand-edited.** Phase 1 edits the server copy and runs `./scripts/check-shared.sh --fix`. Editing the client copy directly is silent until a response fails validation in the browser (`scripts/check-shared.sh:10-15`).
- **`server/` and `client/` are pnpm; `reviewer-core/`, `e2e/` and `mcp/` are npm.** No phase here touches an npm package.
- **Both baselines are measured on this branch and are not what the docs say:** `pnpm arch` = **10** entries (not 11), `client pnpm lint` = **49** warnings (not 43). Never regenerate either.
- **No migration, no schema change.** Nothing in these four phases touches `server/src/db/`. If you find yourself running `pnpm db:generate`, you have left the plan.
- **`useRunEvents` clears its buffer when the run-id list changes** — Phase 4's explicit "do not append" note.
- **`client/src/vendor/ui/**` is do-not-touch**, and no phase needs it. Phase 3 uses `ErrorState` from `@devdigest/ui` as an existing export; do not widen the primitive.
- **`AGENTS.md` is the real file and `CLAUDE.md` is a symlink** — irrelevant here only because no phase edits either. Do not add a note to one.

## Risks and unknowns

- **Assumption: adding `response` schemas to the two routes changes no payload.** `latestMultiAgentRunForRepo` returns exactly `{id, prId, prNumber}` (`run.repo.ts:120-131`) and `agentEstimates` exactly `{agent_id, median_duration_ms, median_cost_usd}` (`run.repo.ts:168-172`). If wrong, `server/test/multi-agent.it.test.ts:270`/`:306` fails immediately and loudly — the serializer strips or rejects. If a field is legitimately extra, widen the schema; do not delete the `response` block.
- **Assumption: `median_duration_ms` can be fractional.** `run.repo.ts:161-166` averages the two middle values on an even sample, so the schema must not be `.int()`. If it were made `.int()`, the failure would surface only on an even-count history — a payload the it-test does not currently produce.
- **Assumption (finding 3): gating the screen on `useAgentEstimates` is wanted.** If the CTO prefers the estimate to be non-fatal, drop `estimatesIsError` from `anyError` and from the retry — one line, no other change.
- **Phase 4 has no automated proof.** `client/src/app` contains zero `page.test.tsx`; adding the first would need a `QueryClientProvider` + `next/navigation` mock harness, which is a new pattern and is out of this round. The gate is typecheck/test/lint plus the named manual walkthrough. If round 2 wants it covered, that is a scoping decision, not a fix.
- **Unknown: whether Docker is available in the executing environment.** `*.it.test.ts` self-skips without it, so Phase 1's strongest gate can pass vacuously. Check the reporter output for `skipped` before claiming Phase 1 done — 10 minutes.

## Recommendations

None. Every item above is a confirmed finding fixed at the size the reviewer
named. The one thing a human may want to decide — whether a retried agent should
rejoin its multi-agent group instead of starting a standalone run — is recorded
in the *Requirement audit* and in Phase 4, and belongs in a spec revision, not in
this plan.

## Out of scope for the implementer

- Architecture review — a separate agent.
- Security review — a separate agent.
- Deciding whether a retried run should rejoin its group (spec question; a human's call).
- Introducing page-level tests under `client/src/app`.
- Any of the review's non-findings, and any file not named in the four phases above.
