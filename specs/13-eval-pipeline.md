# Eval Pipeline — turn accept/dismiss decisions into a regression suite for an agent

**Status:** draft
**Packages touched:** server, client, `@devdigest/shared` (contracts already present)
**Design source:** `design-mocks/src/23-screen_cizruns.jsx:55` (`EvalCaseEditor`,
the one modal), `design-mocks/src/17-screen_agents.jsx:135` (the agent's Evals
tab), `design-mocks/src/14-screen_skills.jsx:131` (`ScreenEval`, the per-owner
dashboard), plus the five L06 mockups — PR detail with a `Turn into eval case`
action on a finding; `Eval Dashboard` as a sidebar page listing agents with
recall / precision / citation columns and a recent-runs table; the per-agent
dashboard with three metric tiles, a trend chart and a run table with a
`Compare` action; the `Compare runs · v6 → v7` modal with metric deltas and a
system-prompt diff; the `Evals` tab inside the agent editor with a case list and
a case editor holding an input diff and an expected-output JSON.
**Supersedes:** nothing
**Borders on:** `evals/` at the repo root is a **different system** — a CLI
harness that A/B-tests *skill bodies* against checked-in fixtures with no
database. This feature is the product-side pipeline: cases live in Postgres next
to the findings they were born from. The two share a scoring idea and nothing
else; neither imports the other.

---

## Problem

Every accept and dismiss recorded in L01–L05 is a labelled example, and all of
them are already in the database: `findings.accepted_at` and
`findings.dismissed_at` (`server/src/db/schema/reviews.ts:56-57`). An accepted
finding is a statement that *this agent should have said this, here*. A
dismissed one is a statement that *this agent should not have said this*. That
is a supervised dataset, produced as a by-product of using the product, and
nothing reads it.

Meanwhile a system prompt, a model, or a linked skill can be changed in the
agent editor at any time, and there is no way to answer "did that make the agent
better or worse" other than opening a PR and looking. The failure mode is
silent: a prompt edit that quietly stops the agent citing lines, or starts it
flagging noise, is invisible until someone notices weeks later.

The storage and the contracts for the answer are already in place and dead:

| Already exists | Where | State |
| --- | --- | --- |
| `eval_cases` table (`owner_kind`/`owner_id`, `input_diff`, `input_files`, `input_meta`, `expected_output`, `notes`) | `server/src/db/schema/eval.ts:7-20` | never read, never written |
| `eval_runs` table (`case_id`, `ran_at`, `actual_output`, `pass`, `recall`, `precision`, `citation_accuracy`, `duration_ms`, `cost_usd`) | `server/src/db/schema/eval.ts:22-35` | never read, never written |
| `EvalCase`, `EvalRun`, `EvalPerTrace`, `EvalOwnerKind` Zod contracts | `contracts/knowledge.ts:192-218` | imported by no producer or consumer |
| `EvalCaseInput`, `EvalRunRecord`, `EvalRunResult`, `EvalTrendPoint`, `EvalDashboard` | `contracts/eval-ci.ts:20-88` | same |
| Grounding gate that drops a finding not citing a real diff line | `reviewer-core/src/grounding.ts:52` | shipped, and the source of `citation_accuracy` |
| `FindingCard` with the accept / dismiss actions | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard` | shipped |

So the work is the pipeline between them, plus one decision the contracts
deliberately left open: `expected_output` is typed `z.unknown()`.

---

## The one shape the contracts do not define

`EvalCase.expected_output` is `unknown`. This spec fixes it, because scoring is
code and code needs a shape.

```ts
// @devdigest/shared — contracts/eval-ci.ts
export const EvalExpectation = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('must_find'),
    file: z.string(),
    start_line: z.number().int(),
    end_line: z.number().int(),
    severity: Severity.nullish(),   // advisory; never gates a match
    category: z.string().nullish(),
  }),
  z.object({
    kind: z.literal('must_not_flag'),
    file: z.string(),
    start_line: z.number().int(),
    end_line: z.number().int(),
  }),
]);
export const EvalExpectedOutput = z.array(EvalExpectation).min(1);
```

Two decisions inside that, both load-bearing:

**A match is `file` equality plus line-range overlap.** Not text similarity, not
a model call. `overlap(a, b) = a.start <= b.end && b.start <= a.end`. A reviewer
that says the right thing about the right lines passes even if it words the
finding differently — which is the only way the score survives a prompt rewrite.

**Severity and category never gate a match.** They are recorded so a later
version can tighten, and reported in `per_trace`, but a case that fails only
because CRITICAL became WARNING would make every prompt edit look like a
regression.

---

## Requirements

### R1 — One click from a finding to a case
`FindingCard` gains a `Turn into eval case` action, visible only on a finding
that has been decided. The expectation type follows the decision and is not a
choice the user makes:

| Finding state | Expectation |
| --- | --- |
| `accepted_at` set | `must_find` at that finding's `file` / `start_line` / `end_line` |
| `dismissed_at` set | `must_not_flag` at the same coordinates |
| neither | the action is **rendered but disabled**, with a title saying a decision is needed first |

The undecided case was specified as "not offered" and changed to
"disabled" after review: hiding the action entirely also hides the fact that
accept/dismiss has a second purpose, and nobody discovers a control that is
never on screen. A disabled control must say why, which is what the title is
for — a dead button with no explanation would be worse than either.

**Acceptance:** on a PR with one accepted and one dismissed finding, two clicks
produce two rows in `eval_cases` whose `expected_output[0].kind` is `must_find`
and `must_not_flag` respectively.

### R2 — The case captures its own input, pinned
The case stores the **diff slice for the finding's file** in `input_diff`, taken
from the PR at the finding's `head_sha`, plus `input_meta` = `{ pr_number,
head_sha, source_finding_id, source_run_id }`. Nothing is fetched from GitHub at
run time.

**Why:** two runs of two agent versions must see byte-identical input, or the
metric delta measures the diff, not the change. A case whose input is re-fetched
is not a regression test.

**Acceptance:** deleting the source PR's rows leaves the case runnable and its
`input_diff` unchanged.

### R3 — `POST /agents/:id/eval-runs` runs the whole set
One request runs every case whose `owner_kind='agent'` and `owner_id=:id`,
sequentially, and returns `EvalRunResult[]`. Each case produces one `eval_runs`
row. The route is rate-limited like the review routes and rejects an agent with
zero cases with `422`.

**Acceptance:** an agent with 8 cases yields 8 `eval_runs` rows with the same
`ran_at` minute and a single response body.

### R4 — Scoring is code, and makes no model call
The scorer takes `(expectations, grounded findings)` and returns numbers. The
only model call in the whole flow is the agent's own review of each case's
`input_diff`; nothing judges the output.

```
matched(e, f)  = f.file === e.file && overlap(f, e)

must_find     M = expectations where kind = must_find
must_not_flag N = expectations where kind = must_not_flag
findings      F = the agent's findings AFTER the grounding gate
Fraw            = the agent's findings BEFORE the gate

recall            = |{ e in M : some f in F matches e }| / |M|
precision         = |{ f in F : no e in N matches f }| / |F|
citation_accuracy = |F| / |Fraw|
pass              = every e in M matched AND no f in F matches any e in N
```

Three edge cases the formulas must state, because each has a defensible wrong
answer:

- `|M| = 0` (a case built only from dismissals) → `recall = 1`. Nothing was
  required, so nothing was missed. Reporting 0 would punish a correct run.
- `|F| = 0` → `precision = 1`. Saying nothing flags no noise. This is why
  precision alone can never be the gate.
- `|Fraw| = 0` → `citation_accuracy = 1`. No finding was dropped because none
  existed.

**Acceptance:** a unit test asserts each of the three, and `grep` over the
scorer module finds no import of an LLM provider or of `reviewer-core`'s `run`.

### R5 — `precision` is what dismissals buy
A `must_not_flag` expectation only ever lowers `precision`, and only when the
agent flags those lines. It is the one metric that moves when an agent becomes
noisier, and the reason the dataset needs dismissals at all.

**Acceptance:** adding one `must_not_flag` case that the agent does flag lowers
`precision` for the set and leaves `recall` unchanged.

### R6 — A run records what it ran against
Each `eval_runs` row stores `actual_output` (the grounded findings) so a later
comparison can show *why* a number moved, not only that it did. The run also
records the agent's `provider`, `model` and system prompt **version**, taken
from the `agent_versions` snapshot at run time.

**Acceptance:** the compare view can render a prompt diff between two runs
without re-reading the agent, which may have changed again since.

### R7 — Evals tab in the agent editor
A tab listing the agent's cases with per-case last result, a `Run all evals`
action, and the three metric tiles for the latest run. A case row shows its
expectation kind and `expected N findings, got M`.

**Acceptance:** the mockup's `3 / 5 passing` header, per-case pass icons and the
`never run` state for a case with no runs are all reachable.

### R8 — Eval Dashboard page
A sidebar entry under Skills Lab, listing every agent with `recall`,
`precision`, `citation_accuracy` and `passed/total` from its latest run, plus a
`Recent eval runs · all agents` table. Selecting an agent opens its detail with
the trend chart and the run table.

**Acceptance:** an agent that has never been evaluated appears with an explicit
"never run" state, not a zero — a zero and an absence are different claims.

### R9 — Compare two runs
Selecting two runs and pressing `Compare` shows the metric deltas and the
system-prompt diff between them.

**Acceptance:** the delta is computed from the two stored rows only; no re-run.

### R10 — At least eight cases, from real decisions
The seeded workspace ends with ≥8 cases for one agent, all created through R1
from findings that already carry a decision — none hand-written.

### R11 — The experiment
Two runs of the same set: current system prompt, then an edited one. Then a
deliberately degraded prompt (e.g. instructing the agent to also report style
nits) and a third run.

**Acceptance:** run 1 → run 2 moves `recall` or `precision` visibly; run 3 drops
`precision` below both. Screenshot of the compare view is the artefact.

### R12 — `pnpm verify:l06`
A script that fails unless: both tables have rows; the scorer module imports no
provider; the three edge cases hold; a set of ≥8 cases exists with both
expectation kinds present; and two runs of the same set with different prompt
versions exist.

---

### R13 — One editor, not three

`design-mocks/src/23-screen_cizruns.jsx:55` shows a single `EvalCaseEditor`: two
columns, `Name` + `Input` tabs (`Diff` / `Files` / `PR meta`) on the left,
`Expected output` with a `valid JSON` badge and a `Finding skeleton` button on
the right, and a footer of `Run on save` · `Cancel` · `Run case` · `Save`.

Every entry point uses it — the finding card, both editors' `New eval case`, and
the per-case edit action. What differs is what it was opened with, never the
layout:

| Source | Seeded from | Input |
| --- | --- | --- |
| `finding` | the decided finding | pinned, read-only |
| `manual` | nothing | typed in |
| `edit` | the stored row | read-only |

**The expectation is JSON, not a form of fields.** A fields UI cannot express a
case that asserts more than one thing, and a case asserting several is exactly
what this pipeline is for. `Finding skeleton` is what keeps that from being a
blank box.

**Acceptance:** there is one modal component; removing any of the three that
existed before breaks nothing, because there are no longer three.

### R14 — What a skill is judged by

A skill reviews nothing on its own, so `GET /skills/:id/eval-cases` returns its
own cases **plus** the sets of every agent that links it, each tagged with its
owner. The skill's Evals tab groups by agent and offers the same per-case
actions, because those routes are case-scoped rather than agent-scoped.

There is deliberately **no** `POST /skills/:id/eval-runs`: running a skill's set
means running it through an agent, and which agent that is, is a choice. One
"run everything" button on a skill linked to three agents would spend three
budgets on the user's behalf without asking.

**Acceptance:** a skill linked to an agent with cases shows them, grouped by
agent; a skill linked to none says which of the two reasons it is.

## What this spec deliberately does not cover
- **Skill-OWNED cases.** `owner_kind` allows `'skill'` and the create route
  accepts it, but such a case cannot be run — `runCase` refuses. Storing one
  stays allowed; making it runnable needs a "through which agent" answer that
  nothing currently supplies.
- **Thresholds and CI gating.** Trend first, gates later — a threshold chosen
  before we know the variance of these numbers is a threshold that will be
  ignored.
- **A model-based judge.** Expectations are `file:line`; a judge would add cost,
  nondeterminism and nothing else.

## Corner cases the mockups do not show

1. **A case whose file no longer exists in the input diff.** The finding it came
   from cited a file; nothing guarantees the pinned diff still contains it if
   the case was edited. The scorer must treat an expectation whose file is
   absent from `input_diff` as an authoring error and surface it on the case,
   not silently score it 0.
2. **Two findings matching one `must_find`.** Recall counts expectations, not
   findings, so this is 1/1 — but precision must not double-count either. State
   that matching is per-expectation and a finding may satisfy at most one.
3. **An agent that errors mid-set.** Cases already run keep their rows; the
   response reports the failure per case rather than rolling back, or a single
   provider timeout costs the whole set.
4. **A deleted agent with cases.** `eval_cases.owner_id` is a bare uuid with no
   FK. Deleting the agent orphans them; the dashboard must not crash on an
   owner it cannot resolve.
