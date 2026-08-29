# Multi-Agent Review — run a chosen set of agents on one PR and show where they disagree

**Status:** draft
**Packages touched:** server, client, `@devdigest/shared`
**Design source:** `design-mocks/src/19-screen_multiagent.jsx` (N4 — the Columns
and Tabs views, `ConflictsSection`, `AgentColHeader`), plus
`design-mocks/src/18-screen_trace.jsx` (the Live Log / Run Trace drawer both
views link into) and the L07 lab mockups of a screen the design file does
**not** contain: a `Configure run` page (PR picker + agent checkboxes + a
per-agent time/cost estimate + `Run multi-agent review (N)`) and a
`Run Review ▾ → PICK AGENTS TO RUN` popover on the PR page.
**Supersedes:** nothing
**Borders on:** `specs/13-eval-pipeline.md` owns `Turn into eval case`, which
this screen's detail view re-uses unchanged. This spec does not touch scoring,
eval cases or the grounding gate.

---

## Problem

The server can already run several agents on one PR in parallel, and nothing in
the product lets you choose which ones or compare what came back.

`POST /pulls/:id/review` takes `RunRequest = { agentId?, all? }`
(`contracts/platform.ts:339-343`) — one agent, or every enabled agent, and no
third option. `ReviewRunExecutor.executeRuns`
(`server/src/modules/reviews/run-executor.ts:74`) then loads the diff and intent
**once**, map-reduces each agent over them, streams events per run, and isolates
per-agent failures. The expensive, hard part is built. What is missing is
everything around it:

- there is no way to say *these three*, so a five-agent workspace pays for five
  runs or gets one;
- each run's findings land in their own `reviews` row and are read one review at
  a time — two agents flagging the same line produce two unrelated cards on the
  PR page, and nothing says they are about the same thing;
- **nothing says an agent looked at a location and stayed silent**, which is the
  only reading that makes a second opinion worth its cost;
- the `multi_agent_runs` table exists (`server/src/db/schema/runs.ts:54-63`) with
  `{id, workspace_id, pr_id, ran_at}` and **no column any `agent_runs` row can
  point at**, so it cannot group anything today;
- `client/messages/en/runs.json` already carries a complete string set for this
  screen — `page.title`, `conflicts.*`, `column.*`, the `columns`/`tabs`
  switch — written against the *run-all* design and consumed by nobody.

### What already exists

| Already exists | Where | State |
| --- | --- | --- |
| Parallel execution, one diff+intent load, per-agent failure isolation | `reviews/run-executor.ts:74` | shipped |
| `POST /pulls/:id/review`, rate-limited to 10/min | `reviews/routes.ts:34-52` | shipped, single/all only |
| SSE `GET /runs/:id/events` with a replay buffer | `reviews/routes.ts:55` | shipped |
| `run_traces` (whole trace as one jsonb doc) + `RunTraceDrawer` | `schema/runs.ts:47`, `pulls/[number]/_components/RunTraceDrawer` | shipped |
| `agent_runs` with `duration_ms`, `cost_usd`, `tokens_*`, `score`, `blockers`, `head_sha`, `source` | `schema/runs.ts:9-45` | shipped — the estimate's data source |
| `multi_agent_runs` | `schema/runs.ts:54` | table exists, unreachable, never written |
| Multi-agent i18n strings | `client/messages/en/runs.json` | present, unconsumed, written for run-all |
| `RunReviewDropdown` (`Run all` / one agent / Configure agents) | `pulls/[number]/_components/RunReviewDropdown` | shipped — the picker's host |
| `ReviewRecord` carries `agent_id` + `agent_name` | `contracts/review-api.ts:23` | shipped — attribution already survives to the client |

---

## Scope — in / out

**In.** The agent picker on the PR page; the subset
contract; run grouping; a grouping pass over findings that keeps every original;
the disagreement block; the results page in both Columns and Tabs modes with
live per-agent status; the estimate.

**Out.** Changing how a single agent reviews (`reviewer-core` is untouched).
Changing the grounding gate. `ci/` and any CI runner — that is spec 15, and
this branch must not create either. Cross-PR comparison. Any automatic
resolution of a disagreement: the product shows the disagreement, the human
resolves it.

---

## Contract changes — `@devdigest/shared` first

### C1 — `RunRequest` gains a subset

```ts
// contracts/platform.ts
export const RunRequest = z.object({
  agentId: z.string().optional(),
  agentIds: z.array(z.string()).min(1).max(8).optional(),  // NEW
  all: z.boolean().optional(),
});
```

`agentIds` is additive; `agentId` and `all` keep working byte-for-byte, because
`RunReviewDropdown` and the e2e flows already send them. Precedence when more
than one is present: `agentIds` > `agentId` > `all`, resolved in
`ReviewService.resolveTargets` and asserted by a test — a silent "last one wins"
is how a run costs five times what the button said.

The `max(8)` is a cost fuse, not a UI limit. It is the same reasoning as the
route's existing 10/min rate limit (`reviews/routes.ts:36`): one request can
fan out to N model calls, so N is bounded server-side and not only in the
button that sends it.

### C2 — the group id rides on the run row that already exists

```ts
// contracts/trace.ts — RunSummary gains one field
multi_agent_run_id: z.string().nullable(),
```

That is the whole change. `RunSummary` already carries `agent_name`, `status`,
`error`, `duration_ms`, `cost_usd`, `findings_count`, `score` and `head_sha`
(`contracts/trace.ts:152-175`) — everything a column header renders — so
`GET /pulls/:id/runs` serves the results page by filter, and no new read route
or wrapper contract is needed. `complete` is derived where it is displayed: every
member in a terminal status. A `MultiAgentRunSummary` object was specified here
and cut — it restated fields the run row already had.

`ReviewRunResponse` gains `multi_agent_run_id: z.string().nullable()` so the
client knows which group it just started. Null on the single-agent path, which
is not a multi-agent run and must not invent one.

**The one read route.** `GET /pulls/:id/multi-agent-runs/:multiAgentRunId`
returns `MultiAgentRunView = { runs: RunSummary[], groups: FindingGroup[] }`.
It carries no `pr_id` because the path already has it — which is the whole
reason the results page is nested under the PR route rather than sitting at
`/repos/:repoId/multi-agent/:id`. A flat URL would force either a wrapper field
restating the PR or a lookup resolving `multi_agent_run_id` to `pr_id`, and
nothing in the codebase does that today.

### C3 — grouping is a contract, not a client-side heuristic

```ts
export const FindingGroupTake = z.object({
  agent_id: z.string(),
  agent_name: z.string().nullable(),
  /** null = this agent ran over this location and did not flag it. */
  finding: FindingRecord.nullable(),
});

export const FindingGroup = z.object({
  key: z.string(),                 // stable: `${file}:${anchor_start}-${anchor_end}`
  file: z.string(),
  anchor_start: z.number().int(),
  anchor_end: z.number().int(),
  title: z.string(),               // the highest-severity member's title
  takes: z.array(FindingGroupTake),
  /** true when at least one take flagged and at least one did not. */
  conflict: z.boolean(),
});
```

`takes` covers **every agent in the run**, including the silent ones — that is
what makes `did not flag` (already a string in `runs.json:17`) a claim the
server stands behind rather than an inference the client draws from an absence.

---

## Requirements

### R1 — Pick a subset, on the PR page
`Run Review ▾` gains a `PICK AGENTS TO RUN` section: a checkbox per enabled
agent, a `Clear` action, and a primary `Run multi-agent review (N)` that is
disabled at N = 0. The existing `Run all` and per-agent items stay — this is an
addition to `RunReviewDropdown`, not a replacement.

**The second entry point is `Configure run`** (R8) — the full-screen picker the
design carries at `design-mocks/src/19-screen_multiagent.jsx:107`. An earlier
draft of this spec cut it as a duplicate of navigation; that judgement was made
against a stale copy of the design in which the screen did not exist, and it is
reversed here. The dropdown stays because it is the fast path from a PR you are
already reading; `Configure run` is the path from the sidebar, where no PR is in
context yet.

The results page lives **inside** the PR route —
`/repos/:repoId/pulls/:number/multi-agent/:multiAgentRunId` — so the PR is
structurally in the path and never has to be resolved from a group id.

**Acceptance:** with 5 enabled agents, checking 2 and clicking run issues exactly
one `POST /pulls/:id/review` whose body is `{agentIds: [a, b]}`, and exactly 2
`agent_runs` rows appear.

### R2 — A run is a group, and the group is in the database
`agent_runs` gains `multi_agent_run_id uuid references multi_agent_runs(id) on
delete set null`. The service inserts one `multi_agent_runs` row **before**
queueing, stamps every member run with it, and returns its id (C2).

Nullable, `on delete set null`, and never backfilled: every run written before
this feature is a legitimate single run, and inventing a group for it would make
the history lie. A single-agent run also stays null — see C2.

**Acceptance:** after an R1 run, `select multi_agent_run_id from agent_runs
where id in (…)` returns one shared non-null id, and `GET /pulls/:id/runs`
returns those rows carrying it, each with its own `status`.

### R3 — Grouping keeps every original
The server groups findings across the run's reviews into `FindingGroup[]` (C3).
Two findings group when **`file` matches and their line ranges overlap** —
`a.start <= b.end && b.start <= a.end`, the same rule spec 13 fixed for eval
matching, for the same reason: it survives a prompt rewrite that rewords a
finding. Title similarity is a tiebreak for the group's display title only, and
never merges or splits a group on its own.

The group's `anchor` is the union of its members' ranges. **No finding is
rewritten, merged or dropped** — a group holds references, and every original
row stays readable and actionable through its own agent's column or tab.

A group is a `conflict` when at least one agent flagged it and at least one
other agent in the same run did not. Agents that were not part of the run never
appear as `did not flag`.

**Acceptance:** a fixture PR where two agents flag `ratelimit.ts:50-54` and
`ratelimit.ts:52` and a third stays silent yields one group with three takes,
`conflict: true`, and both original findings retrievable by id.

### R4 — Where agents disagree
Below the results, `Where agents disagree` lists the groups: file:line, the
group title, and one cell per agent showing that agent's severity or the muted
`did not flag`. `Show only conflicts` filters to `conflict: true`. With no
conflicts it renders `conflicts.empty`, not an empty box.

The mock renders each take's `note` (`19-screen_multiagent.jsx`, `t.note`). A
silent agent has no note to render and inventing one would be a fabricated
rationale, so a `did not flag` cell shows the label alone.

**Acceptance:** toggling `Show only conflicts` on the R3 fixture hides
unanimous groups and keeps the conflicting one; a run where every agent agrees
shows the empty string.

### R5 — Two views over one run
`/repos/:repoId/pulls/:number/multi-agent/:multiAgentRunId` renders `Columns`
(default) and
`Tabs`, switched by the segmented control from the mock, with the choice kept in
the URL so a shared link opens what the sender saw.

- **Columns:** one card per agent — icon, name, `duration · cost`, circular
  score, its findings as compact rows, and a footer with `View trace` and the
  finding count.
- **Tabs:** one tab per agent with its score, then that agent's summary banner
  and its findings as full `FindingCard`s — confidence, suggested fix, and the
  existing `Accept` / `Dismiss` / `Learn` / `Turn into eval case` actions,
  unchanged from spec 13.

**Acceptance:** both views render the same run from the same fetch; the actions
in Tabs write through the same `POST /findings/:id/{accept,dismiss}` routes and
the accepted state survives a switch to Columns and back.

### R6 — Live status per agent, and a failure that stays local
Each column and tab subscribes to its own run's SSE stream and shows queued →
running → done/failed while the run is in flight, reusing `LiveLogStream` and
linking to `RunTraceDrawer` per run. A failed member renders its error in its
own column with a retry for that agent only; the others keep streaming and keep
their results.

This is a UI requirement, not a server one: `executeRuns` already isolates
per-agent failure. The screen must not undo that by rendering one error banner
for the whole run.

**Acceptance:** killing one agent's provider (invalid model id) leaves the other
columns green with findings, and the run's `complete` flips true once the failed
member is terminal.

### R7 — Every agent's trace and live log, from the results page

`View trace` in a column footer and in a tab header opens the **existing**
`RunTraceDrawer` for that agent's own run — not a new component and not a
reduced one. The drawer already carries everything the review needs to be
explainable: the `Trace` / `Live log` tabs, and inside the trace
Configuration, Stats, Prompt assembly, Tool calls and Raw output with its
copy-to-clipboard footer.

It is reusable as it stands. Its props are `{runId, agentName, prNumber,
findings, running, onClose}` and its data comes from `useRunTrace(runId)` and
`useRunEvents([runId])` — keyed by run, with no coupling to the PR page beyond
an optional `prNumber` label
(`client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.tsx:19-28`).
Each column passes **its own** `runId`, so N agents means N independent
drawers, one at a time.

The work is therefore a **move, not a rewrite**: the component sits in a
route-private `_components/` folder and is mounted by exactly one file
(`pulls/[number]/page.tsx:17`). A component two routes need belongs in
`client/src/components/`, alongside `run-cost-badge` and `diff-viewer`. Move
the folder to `client/src/components/run-trace-drawer/`, update that one
import, and change nothing about its behaviour. Do not fork a second copy for
the multi-agent screen — two drawers drift, and the trace is the artefact that
has to agree with itself when a finding is disputed.

`running` is what makes this more than a post-mortem view: while the fan-out is
in flight the drawer opens on `Live log` and streams that agent's SSE, which is
the same stream R6's column status is already subscribed to.

**Acceptance:** on a 3-agent run, `View trace` in each column opens the drawer
for that agent's `runId` and the Configuration section names that agent's
model; opening it mid-run lands on `Live log` with events arriving; the
component exists at exactly one path in the repo (`git ls-files | grep -c
RunTraceDrawer.tsx` returns 1) and the PR page still mounts it unchanged.

### R8 — `Configure run`: pick a PR, pick agents, see the price first

`/repos/:repoId/multi-agent` is a two-phase screen, exactly as
`design-mocks/src/19-screen_multiagent.jsx:150-180` renders it.

**Arriving shows the most recent multi-agent run's results for this repo** — not
an empty form. That is the whole answer to "I ran a review, navigated away, and
could not get back to it". With no run yet, it shows the config phase instead;
with runs but none selected, the `No agents selected` empty state with a
`Configure run` CTA (`:162-163`).

**`Configure run`** (the header button at `:167-170` — `Settings` icon, 12px/600
on `--bg-surface` with a 1px border, sitting to the *left* of the `Multi-Agent
Review` heading) switches to the config phase:

1. **Pull request** — a numbered step badge (22px circle, `--accent-bg`) and a
   `Dropdown` of open PRs, width 420 (`:118-124`).
2. **Agents to run** — one `PersonaPickCard` per enabled agent (`:93`): an 18px
   checkbox that fills with the agent's colour when on, a 30×30 icon tile at
   `colour + "1f"`, name 13.5/600, one-line summary 11.5 muted, and the agent's
   `Ns · $X` right-aligned in mono. The card's border and background take the
   agent's colour when selected. `Select all` / `Clear all` sits at the right of
   the step header as a bare accent-coloured text button.
3. Before a PR is chosen, step 2 is a **dashed-border placeholder** — `Pick a
   pull request first` (`:139-144`), not a disabled list.
4. **The run bar** — `<Button kind="primary" icon="Users">` reading
   `Run multi-agent review (N)`, or `Run 1 agent` at N = 1, or `Select agents`
   at N = 0 where it is disabled; beside it, in mono muted,
   `≈ {time}s · ${cost} · parallel fan-out`.

**Acceptance:** arriving with an existing run renders that run's results and not
a form; `Configure run` reaches the picker with the current PR preselected;
choosing 2 of 5 agents issues one `POST /pulls/:id/review` with `{agentIds}`;
with no PR chosen the agent step is the dashed placeholder and the run button is
disabled.

### R9 — The estimate, restored, and honest about where it comes from

The run bar and each `PersonaPickCard` show that agent's expected time and cost.
**Total time is the maximum of the members, total cost is their sum** — the
design computes it exactly this way (`:113-114` and `MetaRow` at `:43-44`),
because the runs are parallel; summing durations would print a wall-clock number
that is simply false.

This was cut from an earlier draft on the grounds that nothing serves the
numbers. That is still true and is now a **work item rather than a reason to
drop the feature**: `AgentStats` exists with `avg_cost_usd` and `avg_latency_ms`
(`contracts/observability.ts:95-118`) and **no route returns it** — verified.
One read route must expose per-agent aggregates over that agent's own recent
`agent_runs`.

Use a **median** over the last N runs, not a mean: one pathological run should
not move the number the user is shown before they spend money. An agent with no
history shows `no estimate yet`, never `~0s · $0.00` — a zero and an absence are
different claims, the rule `EvalAgentSummary` already follows
(`contracts/eval-ci.ts:222-233`).

**Acceptance:** an agent with no prior runs shows the absence label; selecting
three agents shows a total time within tolerance of the slowest, not the sum;
the same three agents' costs add up.

### R10 — Navigation, with the vendored file exception

`Multi-Agent Review` is added to a new `GLOBAL` section in
`client/src/vendor/ui/nav.ts`, pointing at `/repos/:repoId/multi-agent`. The
design's own frame marks this screen `active: "personas"`, so a sidebar entry is
part of the intended product, not an addition.

`nav.ts` is under `client/src/vendor/**`, which the repo marks do-not-touch. The
addition is a deliberate, minimal exception: one group, one item, appended, no
reformatting. It is **not** shared with `specs/15-export-to-ci.md` — that spec's
v1 adds no nav entry — so this file has one editor and no merge ordering.

Use `multi-agent` as the item's `key`: `activeKeyFor` already returns exactly
that string for any path containing `/multi-agent`
(`client/src/components/app-shell/helpers.ts:28`), a branch that has been dead
since it was written and starts working the moment the key matches.

**Acceptance:** the item renders under `GLOBAL`, resolves for a repo with runs
and for one without, and `git diff client/src/vendor/ui/nav.ts` is one appended
group with one item.

### R11 — Getting back to a comparison from the PR

A multi-agent run is reachable from its PR after the fact, not only in the
moment it is started.

Today's gap, and the reason this requirement exists: R1 navigates to the results
when a run is *launched*, and nothing else links there. Open the PR tomorrow and
the comparison you paid for is unreachable — the same complaint R8 answers for
the sidebar, arriving from the other direction.

The PR's **`Agent runs`** tab already lists every run as its own expandable card
(`design-mocks/src/11-prdetail_runs.jsx:114`, `ReviewRunCard`), so the members of
a group are on screen already; nothing says they belong together. Runs sharing a
`multi_agent_run_id` are therefore rendered under one group header carrying the
agent count, the run time, and a link reading **`Compare side by side`** that
opens `/repos/:repoId/pulls/:number/multi-agent/:multiAgentRunId`. Runs with a
null group id render exactly as they do now.

**This needs no new endpoint.** `GET /pulls/:id/runs` already returns
`RunSummary[]`, and C2 puts `multi_agent_run_id` on that shape — so the grouping
is a `groupBy` in the component over data the tab already fetches. If this
requirement seems to want a route, the design has drifted from C2.

The link is **not** added to the PR header. That row already carries
`View on GitHub`, `Run Review ▾` and `Compose review`
(`design-mocks/src/12-screen_pr_detail.jsx:181-185`), and a fourth control that
is only meaningful when a group happens to exist would be dead most of the time.
The `Agent runs` tab is where run history already lives.

**Acceptance:** on a PR with one three-agent group and one single run, the tab
shows one group header with `3 agents` and a working `Compare side by side`
link, and the single run renders ungrouped with no link; on a PR whose runs are
all single, the tab is visually unchanged from today.

---

## Design conformance

Both screens are built by **reading the mock source**, not by eyeballing a
screenshot. `design-mocks/src/` modules are plain `React.createElement` with
every value inline, so each number below is copied, not estimated. Where this
spec departs from a mock, it says so — silent divergence is the failure mode
these two sections exist to prevent.

### The page frame — from the app, not from the mocks

Both new screens use:

```ts
page: { padding: "24px 32px 44px", maxWidth: 1200, margin: "0 auto" }
```

**Correction, 2026-08-28:** an earlier draft of this section claimed the mocks
have no centering story. That was true of the stale copy then in `design-mocks/`
and is false of the refreshed one — `RunConfig` centres itself with
`maxWidth: 720, margin: "0 auto"` (`19-screen_multiagent.jsx:116`). So `Configure
run` uses the design's own 720px frame (see its conformance table below), and
only the **results** and any full-width screen use the app frame above. The
mocks' `28px` horizontal padding still differs from the app's `32px`; prefer the
app's on full-width screens, since that is what the neighbouring pages do.

The values above are `PageContainer`'s
(`client/src/components/page-shell/styles.ts:5`) — the one shared helper in the
client meant to answer this question.

**This is the app's least consistent area, and the new screens should not add to
it.** Measured on `w8`: horizontal padding is `28px` on the Eval dashboard,
Conventions and Project Context but `32px` on the Agents list and
`PageContainer`; the max width is 880, 1080, 1100, 1180, 1200 or 1280 depending
on the screen; and `CONTENT_MAX_WIDTH` is declared **three separate times with
three different values** — 1280 (`context/.../constants.ts:5`), 880
(`conventions/.../constants.ts:12`), 1080 (`tour/.../constants.ts:5`). Do not
import one of those; do not add a fourth. Use the literal above until somebody
does the consolidation as its own task.

Inside that frame, every element measurement below comes from the mock.

### The results screen — `design-mocks/src/19-screen_multiagent.jsx`

Authoritative for R4, R5 and R6. Copy from it:

| Element | Source | What to match |
| --- | --- | --- |
| Page header | `:88-95` | `padding: 18px 28px 4px`; `h1` 20px/700, `letterSpacing: -0.02em`; muted 12.5px subtitle beside it; the `columns`/`tabs` segmented control pushed right with `marginLeft: auto` — 2px gap, `--bg-surface` track, 1px border, radius 7, 2px padding; each button 4px/12px, 11.5px/600, radius 5, active on `--bg-elevated` |
| Meta row | `:44-48` | `padding: 14px 28px`, bottom border, 12.5px `--text-secondary`; mono PR number, bold title, right-aligned run summary behind a `Cpu` icon in `--accent` |
| Columns grid | `:51-54` | `repeat(N, minmax(220px, 1fr))`, gap 12, `overflowX: auto` past five agents; card = 1px border, radius 9, `--bg-elevated`, and a **2px top border in the agent's colour** |
| Column header | `:12-20` | 30×30 icon tile, radius 8, background = agent colour at `1f` alpha; name 12.5/600 truncating; mono 10.5 muted `duration · $cost`; `CircularScore` size 32, stroke 3.5 |
| Finding row | `:3-10` | `padding: 8px 10px`, radius 6, `--bg-surface`, **2px left border in the severity colour**; 12px/600 title; mono 10.5 muted `file:line` |
| Column footer | `:57-59` | `padding: 9px 12px`, top border, `--bg-surface`, `MonoLink` "View trace" left and the finding count right |
| Tabs | `:63-70` | tab bar `padding: 0 28px` with a bottom border; each tab 12px/16px with `marginBottom: -1` and a 2px bottom border in the agent's colour when active; the score number coloured `--ok` ≥ 70, `--warn` ≥ 50, else `--crit` |
| Tab body | `:72-78` | `maxWidth: 760`; summary banner with `CircularScore` 44 and a **3px left border** in the agent's colour |
| Conflicts | `:23-40` | `marginTop: 22`; `SectionLabel` with the toggle on the right; each group = radius 8, `--bg-elevated`, header row `padding: 10px 14px` with a `Code` icon, mono `file:line`, bold title; takes as `repeat(N, 1fr)` with **gap 1 over a `--border` background**, so the 1px separators are the gap, not borders; each cell `padding: 10px 14px`, agent name 11.5/600 secondary, a 7px dot, the verdict uppercased, and the note 11.5 muted |

**Deliberate divergences, already decided elsewhere in this spec:**

1. The meta row's `fan-out via worktrees` (`:47`) is false here — this server
   fans out on p-queue. The shipped string `page.meta` is correct and is not
   "corrected" to the mock (N1).
2. The mock's tab bar has no live status; R6 adds queued/running/done per column
   and per tab, and a failed agent renders its error inside its own column.
3. A `did not flag` cell renders the muted label **alone** (R4). The mock draws a
   `note` for every take; a silent agent has no note, and inventing one would be
   a fabricated rationale.

### `Configure run` — `19-screen_multiagent.jsx:93-149`

| Element | Source | What to match |
| --- | --- | --- |
| Container | `:116` | `padding: 24px 28px 40px`, `maxWidth: 720`, `margin: 0 auto` — **the design centres this screen**; it is narrower than the results view on purpose |
| Heading | `:117-118` | `h1` 22px/700 `letterSpacing: -0.02em`; 13px `--text-secondary` lead at `marginTop: 4`, `marginBottom: 22` |
| Step badge | `:121` | 22px circle, `--accent-bg` / `--accent-text`, 12px/700; greys to `--bg-hover` / `--text-muted` while the step is not reachable |
| Step body | `:124` | indented `marginLeft: 32` under its badge |
| PR dropdown | `:125-128` | `Dropdown` width 420, trigger is a `secondary` Button with `GitPullRequest` and a `ChevronDown` |
| `Select all` | `:135-136` | bare button at the step header's right — no border, no background, `--accent-text`, 12px/600 |
| Agent card | `:93-105` | full-width button, `padding: 12px 14px`, radius 9, gap 12; 18px checkbox radius 5 that fills with the agent's colour and shows a white `Check` at 12px; 30×30 icon tile at `colour + "1f"`; name 13.5/600; summary 11.5 muted `lineHeight: 1.45`; mono `Ns · $X` right, `whiteSpace: nowrap`. Selected: border in the agent's colour, background `colour + "12"` |
| No-PR placeholder | `:139-144` | dashed `--border-strong` box, radius 10, `padding: 34px 20px`, centred; 42px icon tile, 14px/600 title, 12.5 muted body capped at `maxWidth: 320` |
| Run bar | `:146-149` | `marginTop: 26`, `marginLeft: 32`; primary Button with `icon="Users"`, label switching at N = 0 / 1 / many; mono 11.5 muted estimate beside it |

### The results header — `19-screen_multiagent.jsx:166-176`

The `Configure run` button sits **left of the heading**, not right: `padding:
5px 10px`, radius 7, 1px `--border` on `--bg-surface`, `--text-secondary`,
12px/600, with a 14px `Settings` icon. The heading follows it, then a muted
`N selected agents · parallel`, then the `columns`/`tabs` switch pushed right.

---

## Non-functional requirements

- **N1 — No new fan-out mechanism.** Execution stays on the existing p-queue
  (`server/src/platform/jobs.ts:42`, concurrency 3) and the existing executor.
  The mock's meta line says `fan-out via worktrees` and the shipped i18n string
  says `fan-out via p-queue` (`runs.json:129`). p-queue is what is true here;
  the string stays, and the mock's wording is not copied.
- **N2 — One diff, one intent, N agents.** The saving that makes 3 agents cost
  less than 3× 1 agent is `loadDiff` + intent running once. A grouping pass that
  re-reads the diff per agent would give that back.
- **N3 — Grouping is pure and hermetic.** It takes findings and returns groups,
  with no DB and no model call, and is tested in a plain `*.test.ts`, not an
  `*.it.test.ts`.
- **N4 — Strings come from `runs.json`.** The keys exist. Where a requirement
  contradicts one (`page.subtitle` and `page.runAll` both assume run-all), the
  string changes with the feature; no new namespace is created.
- **N5 — Server layering.** Grouping is domain logic under
  `server/src/modules/reviews/`, reached through the service; routes stay thin.
  Run `pnpm arch` — the 11-entry baseline must not grow.

---

## Corner cases

| Case | Behaviour |
| --- | --- |
| One agent selected | Runs, `multi_agent_run_id` is null (C2), results page redirects to the normal PR view rather than rendering a one-column comparison |
| Same agent checked twice (double-click) | De-duplicated server-side in `resolveTargets`; N in the button counts distinct agents |
| An agent is disabled between picking and running | That target is dropped with a per-agent note; the rest still run |
| An agent is deleted after the run | `agent_runs.agent_id` is `on delete set null` — the column renders the run with a `deleted agent` label from the trace, never a crash |
| Findings on different files at the same line numbers | Never group: `file` equality is required first |
| A finding spanning a whole file (1..EOF) | Groups with everything in that file — accepted, and why the group title is the highest-severity member rather than the widest |
| PR head moves mid-run | Members already stamp `head_sha` (`schema/runs.ts:41`); a group whose members disagree on head is shown as stale, not silently compared |
| Zero enabled agents | The existing `page.noAgents` empty state with `Go to Agents` |
| Browser closed mid-run | Runs continue server-side; reopening the run URL replays from the SSE buffer and the persisted rows |

---

## Ownership and merge order — worktree A

Files this branch owns: `server/src/modules/reviews/**`, the new multi-agent
service and its client route under
`client/src/app/repos/[repoId]/pulls/[number]/multi-agent/`,
`RunReviewDropdown`, `client/messages/en/runs.json`, and — as part of R7 — the
move of `RunTraceDrawer` out of the PR route's `_components/` into
`client/src/components/run-trace-drawer/` plus the single import in
`pulls/[number]/page.tsx` that follows it.

Files it must **not** touch: `ci/` and `agent-runner/` (they do not exist yet —
creating them here is the boundary violation this split exists to prevent),
`client/messages/en/ci.json`, `server/src/modules/agents/**`.

**Shared with worktree B: nothing.**

An earlier draft had two shared surfaces and a forced merge order. Both are
gone:

1. `client/src/vendor/ui/nav.ts` — **edited by this feature only.** R9 adds one
   `GLOBAL` item pointing at R8's landing page. `specs/15-export-to-ci.md` v1
   adds no `CI Runs` page and therefore no nav entry, so this file has a single
   editor: it is a vendored-path exception, not a shared surface, and it imposes
   no ordering.
2. `@devdigest/shared` — A changes `platform.ts`, `trace.ts` and
   `review-api.ts`. B's v1 changes **no contract at all**: its whole CI surface
   is already written and unconsumed (`contracts/eval-ci.ts:284-390`).
3. `server/src/db/migrations/` — A generates exactly one migration. B's v1
   generates **none**: it writes `ci_installations` using the table as it
   already exists.

So the two features are independently mergeable and this branch imposes no
ordering on the other. A generates `0018_*`; that is A's own business.

---

## Verification

```
cd server && pnpm typecheck && pnpm arch
cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/
cd server && pnpm exec vitest run test/multi-agent.it.test.ts      # grouping over real rows
cd client && pnpm typecheck && pnpm test && pnpm lint              # 49 warnings, no more
```

`pnpm lint` and `pnpm arch` are baselined — green means "nothing new", and
neither baseline may be regenerated as part of this feature.

---

## Decisions — do not re-open these

- **Grouping is server-side.** The client renders groups; it does not compute
  them. Two clients (and later the MCP tools) must not disagree about what
  "the same finding" means.
- **Originals are never rewritten.** A group is references. Accept/dismiss,
  eval cases and traces all keep pointing at the finding the agent actually
  produced.
- **`did not flag` is only claimed for agents in the run.** Anything else is an
  assertion about work that never happened.
- **The subset is capped server-side at 8.**
- **No worktrees.** The mock's phrase is aspirational; this server fans out
  in-process on p-queue.

## Traps

- `multi_agent_runs` **looks** ready and is not — nothing can point at it until
  R2 adds the column. Reading the schema and assuming it works is the trap.
- `runs.json` **looks** like the screen is half-built. The strings are seeded;
  no component consumes them (`grep useTranslations("runs")` returns only the
  trace drawer and the cost badge).
- The mock has no `Configure run` screen and no picker at all — it runs every
  enabled agent. Building only what the mock shows misses the feature.
- `RunRequest` is parsed manually from a tolerant body (`routes.ts:39`), so a
  malformed `agentIds` fails at parse, not at the schema layer. Test it.

## Could not establish

- Whether `p-queue` concurrency 3 should rise for a fan-out of 8. Left alone:
  changing global job concurrency is a platform decision with blast radius
  beyond this feature.

## Open questions

1. Should a multi-agent run be re-runnable as a unit ("run these 3 again"), or
   is re-picking from the same URL enough for L07?
2. Does the PR page's `Needs review` status need to know about a group, or does
   the newest member run still decide it?
