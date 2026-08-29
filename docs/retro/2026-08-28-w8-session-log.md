# Session log — 2026-08-28, branch `w8`

**Not a ledger entry.** `docs/retro/ledger.md` is written only by a deliberate
`/workflow-retro`, and nothing appends to it automatically. This file is the raw
material that skill would need, written while the evidence was still in reach —
the subagent transcripts live in a session-scoped temp directory that disappears
with the session, so what survives is what is written down here.

**Scope of the session:** specs and plans for two L07 features (Multi-Agent
Review, Export to CI). No feature code was written; `/impl` was never run.

---

## 1 · What was produced

| Artefact | Lines | State |
| --- | --- | --- |
| `specs/14-multi-agent-review.md` | 630 | draft, hand-written then hand-revised |
| `specs/15-export-to-ci.md` | 421 | draft, written by `spec-creator` (twice) |
| `plans/14-multi-agent-review.plan.md` | 372 | by `implementation-planner`, hand-revised |
| `plans/15-export-to-ci.plan.md` | 357 | by `implementation-planner`, hand-revised |

Plus: 8 `INSIGHTS.md` entries (4 root, 2 `client/`, 2 `server/`), one one-line
code fix, a refreshed `design-mocks/`, and one `.gitignore` line.

**The only production change:**
`client/src/app/evals/_components/EvalDashboardView/styles.ts:8` — added
`margin: "0 auto"`. It was the one screen in the app with a `maxWidth` and no
centring, so it hugged the left edge on a wide monitor while every sibling
centred. Gates after: client typecheck clean, 42 files / 322 tests green.

## 2 · Measured cost

Numbers from `node .claude/skills/workflow-retro/measure.mjs` (this session's
transcript), not from hand-tallied notifications. An earlier draft of this file
counted only the subagents and drew the wrong conclusion from it; the correction
is below.

**Window:** 2026-08-28 20:06:59Z → 2026-08-29 02:11:13Z — **6h 04m**.

| | Tokens |
| --- | --- |
| Main session output | **600,992** |
| Subagents, 4 finished agents | **303,298** |
| **Total output** | **904,290** |
| Main session input (uncached) | 932 |
| Cache created | 3,020,851 |
| Cache read | 154,513,398 |

**The main session is two thirds of the spend (66.5%), not the agents (33.5%).**
That is the single most important correction to this file. The subagents are the
visible, easy-to-count part and they are the minority; the reading, editing and
re-editing between them is the majority.

**Cache read : created = 51.1:1**, which `measure.mjs` flags as low — context was
rebuilt rather than reused. Its own diagnosis fits what happened: *"many small
edits to files already in context, or a long tail of one-off reads."* This
session made **209 Bash calls**, one every 1.7 minutes for six hours, almost all
of them small `grep`/`sed`/`wc` probes. That is the shape of the cost.

### Agents

Four spawned, **each in its own wave — nothing ran concurrently.**

| # | Agent | Outcome | Tokens | Tool uses | Duration |
| --- | --- | --- | --- | --- | --- |
| 1 | `spec-creator` — Export to CI (full scope) | API error, **resumed**, completed | 95,702 | 1 | 261 s |
| 2 | `spec-creator` — Export to CI **v1** (re-scoped) | completed | 65,924 | 20 | 270 s |
| 3 | `implementation-planner` — Multi-Agent Review | API error, **resumed**, completed | 74,371 | 31 | 645 s |
| 4 | `implementation-planner` — Export to CI | completed | 67,301 | 28 | 368 s |

**Agent wall clock: 25.7 minutes — 7.1% of a 364-minute session.** Agents 3 and 4
plan two features that share no files; they were spawned 43 minutes apart and
could have run concurrently. Serialising them cost roughly ten minutes of wall
clock and bought nothing.

### Other measured facts

- **9 stops to ask the human** (`AskUserQuestion` ×9) — one every 40 minutes.
- Main-session tools: `Bash` ×209 · `AskUserQuestion` ×9 · `Agent` ×4 ·
  `Write` ×3 · `SendUserFile` ×3 · `Skill` ×2 · `SendMessage` ×2 · `ToolSearch` ×1.
- Skills invoked: `engineering-insights` ×1, `impl` ×1 (refused — it is
  human-invocation only).
- **904,290 output tokens produced 2,078 git-visible lines** — about 435 output
  tokens per surviving line, and exactly **one** of those lines is production
  code.

**Not measurable from the transcript**, per the tool: what each subagent read;
which model an `inherit` spawn actually used; and **dollar cost — no price table
is applied, so every figure here is tokens, never money.**

### Infrastructure note

`implementation-planner` has no `Write` tool, so its plan returns as one final
text block. Two agents died on API errors (a sleeping machine, a dropped
connection) — **but both were resumed with context intact and completed.** No
work was lost; the cost was one extra round-trip each. An earlier draft of this
file called this "loses the entire run", which overstated it.

## 3 · Decisions that were made and then reversed

Ten reversals. The interesting part is not that they happened but that **six of
them share one cause.**

| # | Decision | Reversed to | Cause |
| --- | --- | --- | --- |
| 1 | Full-scope Export to CI spec | v1 without ingest | CTO simplicity directive |
| 2 | `test-writer` stage added to plan 15 | no test author at all | contradicted a recorded decision |
| 3 | Per-agent estimate cut | restored | stale design |
| 4 | `Configure run` screen cut | restored | stale design |
| 5 | Sidebar nav item cut | restored | stale design |
| 6 | Landing page as a run **list** (invented) | design's last-run + `Configure run` | stale design |
| 7 | `Start New Review` button added | removed | stale design |
| 8 | Per-row `Run again` added | removed | CTO: one action per screen |
| 9 | `npx` runner distribution | committed `runner.mjs` | stale design |
| 10 | `MultiAgentRunSummary` wrapper | field on `RunSummary` | simplification, held |

### The dominant cause: `design-mocks/` was stale and nobody could tell

`design-mocks/` is **gitignored on purpose** — regenerated locally from
`DevDigest Design (standalone).html` rather than committed. That is a sound
rule, and it has a failure mode nobody had hit yet: **a local copy can silently
fall behind, and nothing in the repo dates it.**

Measured when the CTO supplied `Dev Digest W8.zip` late in the session: **14 of
27 modules were stale.** `19-screen_multiagent.jsx` had grown 10,901 → 18,514
bytes and contained an entire `Configure run` flow — the PR picker, the agent
cards, and the cost estimate — that the copy in the repo did not have.
`20-screen_export.jsx` had already fixed two mistakes that specs written against
the old copy solemnly recorded as *deliberate divergences from the design*.

So five spec decisions (3, 4, 5, 6, 9 above) were reasoned carefully from a
source that was months out of date, and each one had to be argued twice.

**Fixed during the session:** mocks refreshed, three new modules added and wired
into `index.html` in dependency order, `styles.css` vendored, and `INDEX.md` now
opens with a dated refresh note telling the next reader to check a spec's date
before trusting a mock line number. The archive itself was added to
`.gitignore`.

### The second cause: a recorded decision that was not read

Reversal 2. The CTO asked that the implementer write no tests. The plan answered
by adding a `test-writer` stage — re-introducing the exact agent that
`INSIGHTS.md` (2026-08-18) records as **removed from the chain on cost grounds**,
and that `.claude/skills/impl/SKILL.md:209` says is out of it "by choice".

`AGENTS.md` already mandates reading `INSIGHTS.md` before acting. The rule was
not followed, and the cost of not following it was a workflow that was more
expensive than the one it replaced. No new rule is needed; this is evidence that
the existing one binds.

## 4 · What the token spend actually bought

Against the **904,290** total output tokens, not the 303k subagent slice:

- **~601k (66.5%) — the main session.** Reading the repo, writing and rewriting
  the specs by hand, and reconciling four documents after each reversal. This is
  the cost centre, and it is invisible in any per-agent accounting.
- **~96k (10.6%) — the discarded full-scope Export to CI spec.** Rewritten as
  v1. Not waste in principle: it surfaced the localhost/no-auth finding that
  shaped v1. Still the largest single re-do.
- **~66k (7.3%) — the v1 spec that survived.**
- **~142k (15.7%) — the two plans**, both of which survived with hand revisions.

The uncomfortable ratio: **435 output tokens per git-visible line**, for a
session whose entire production-code output is one line. That is the correct
price for planning work — specs and plans are the deliverable — but it should be
quoted as such rather than discovered later.

## 5 · Findings worth keeping (already filed, listed here for the retro)

Filed via `engineering-insights`, so they are already in the right files. Named
here so a retro can see the shape of what one session produced:

- **root** — unbuilt features in this repo are often *pre-seeded end to end*
  (contracts, i18n, vendored UI) and imported by nobody; `grep` before assuming
  something is half-built.
- **root** — two branches that both change the schema collide in
  `meta/_journal.json`, which may never be hand-edited; the fix is procedural.
- **root** — `design-mocks/` is a stale artefact, with three verified examples
  of it asserting something false about the product.
- **server** — `multi_agent_runs` exists but is structurally unusable: nothing
  can point at it until a column is added.
- **client** — there is no page-frame convention, and `CONTENT_MAX_WIDTH` is
  declared three times with three different values (1280 / 880 / 1080).
- **client** — the documented `pnpm lint` baseline (43) is stale; the tree
  reports 49. Measure with `git stash` before assuming you caused a drift.

## 6 · The largest product finding of the session

Made by `spec-creator` while writing the full-scope Export to CI spec, and it
survived into v1 as the reason for its shape:

> The studio is a localhost app. `server/src/server.ts:29` binds `0.0.0.0` on a
> developer machine and `LocalNoAuthProvider`
> (`server/src/adapters/auth/local.ts:14`) means there is no login anywhere in
> the API. **In the default setup GitHub Actions cannot reach the studio at
> all.**

Every "report CI results back to the studio" design therefore needs a tunnel or
a hosted studio before it works for anyone. v1 was re-scoped so the review, the
posted comment and the merge gate all work with **zero connectivity**, and only
the history needs the studio. The topology question is recorded as unresolved.

## 7 · Still open — the next session inherits these

**Unanswered questions put to the CTO and never answered:**

1. Spec 14: does `Run all agents` survive alongside the subset picker? The
   shipped `runs.json` strings (`page.subtitle`, `page.runAll`) were written for
   run-all and contradict the picker. `implementation-planner` assumed *no* and
   flagged it; the strings change in the plan's Phase 8 either way.
2. Spec 15 Q1: does `.devdigest/memory.jsonl` ship in the export bundle? It is a
   dump of the `memory` table into someone else's repository. v1 omits it — the
   only choice where a mistake is recoverable.
3. Spec 15 Q2: agent edited after export — show `config drifted`, or auto-update
   the PR?
4. Spec 15 Q3: is the export preview editable? v1 says read-only.
5. Spec 15 Q4: are CI findings interactive in the studio, or read-only?
6. Two `Fail CI on` controls (Config tab and CI tab) write the same field. The
   plan renders both; the recommendation is read-only on the CI tab.

**Decided but not yet executed:**

- `/impl plans/15-export-to-ci.plan.md` — cannot be launched by an agent
  (`disable-model-invocation`); the CTO runs it.
- `plan-verifier` on plan 15 **before** building — the plan's own recommendation,
  on the grounds that a missing phase costs one file edit now versus a code
  rewrite later. Not run.
- Phase 1 of plan 15 must decide how the generator gets `agent-runner/dist/` —
  Phase 4 produces the bundle that Phase 1 embeds.

**Not propagated:** the "implementer writes no tests" and "capped fix loop"
constraints were applied to `plans/15` only, at the CTO's word ("in this
particular workflow"). `plans/14` still has tests inside its phases — which is
consistent with the chain, since the implementer writes what its phases call
for.

## 8 · Candidate ledger entries

Proposed, not written — `docs/retro/ledger.md` is the human's to append via
`/workflow-retro`. Each names a concrete edit, per that file's bar. Revised after
running `measure.mjs`; two earlier candidates were wrong and are marked.

1. **Stale design source is invisible, and regeneration is unautomated.**
   `design-mocks/` is gitignored and "regenerated locally" — but **no script does
   the regenerating**; `scripts/` has `check-shared.sh`, `dev.sh`, `e2e.sh`,
   `verify-l06.sh` and nothing else, and this session's refresh was done by hand
   with `unzip` and `cp`. A stale copy is therefore indistinguishable from a
   fresh one and caused five reversed spec decisions here.
   *Change:* add `scripts/extract-design-mocks.sh` that unpacks, renumbers, wires
   `index.html` in dependency order, updates `INDEX.md` and writes
   `design-mocks/.source` with the bundle's hash and mtime; then one staleness
   check in `dev.sh`. **Do not** add "the agent must check freshness" to a
   prompt — a mechanical check covers every reader for free, a prompt rule covers
   one agent and costs tokens on every run.
   *Confidence:* high. This is the session's dominant cause.

2. ~~`implementation-planner` cannot checkpoint.~~ **Downgraded — the earlier
   version of this entry overstated the damage.** It has no `Write` tool, so its
   plan is one final text block; two runs died on API errors. **Both resumed with
   context intact and completed**, so the cost was one extra round-trip, not a
   lost run. Both failures were the same infrastructure flakiness on the same
   day, which this file's own bar ("wait for it twice") counts as roughly one
   occurrence.
   *Change:* one line in `.claude/agents/implementation-planner.md` — emit the
   plan as soon as the audit is done, refine after. **Do not** give it `Write`
   yet: read-only is a safety property worth keeping, scoping it would need a
   `PreToolUse` hook like `spec-creator`'s, and the problem may not recur.
   *Status:* provisional.

3. ~~Nothing stops a *plan* from re-adding a removed agent.~~ **Rewritten — the
   earlier version blamed the wrong actor.** `implementation-planner` produced
   plan 15 correctly, without a test stage. The `test-writer` stage was added
   afterwards by the **main session**, when asked to take tests away from the
   implementer. A rule in the planner's prompt would not have caught it.
   *What would have:* reading `## Decisions` in `INSIGHTS.md` before designing a
   workflow — already mandated by `AGENTS.md`. Restating that rule in a second
   file grows the system without making it more likely to be obeyed.
   *Change, if any:* put the check where it is mechanical rather than
   conscientious — `/impl` reads the plan and flags a stage naming an agent
   outside its own chain (`.claude/skills/impl/SKILL.md`).
   *Confidence:* medium on the mechanical version, zero on the prompt version.

4. **The agents are not the cost centre; the main session is.** Measured:
   601k main-session output against 303k across four subagents, with a
   cache read:created ratio of 51.1:1 that `measure.mjs` itself flags as low, and
   209 Bash calls in six hours. Any conversation about "reducing agent cost"
   that starts with the subagents is optimising the smaller third.
   *Change:* none to a prompt. This is a measurement worth quoting the next time
   the agent roster is trimmed for cost — the 2026-08-18 decision that removed
   `test-writer` and downgraded two agents to `sonnet` was aimed at the third of
   the spend that is easiest to see.
   *Confidence:* high, but single-run — re-measure before acting.

5. **Independent agents were serialised for no reason.** All four spawns were
   their own wave; nothing ran concurrently. Agents 3 and 4 planned two features
   that share no files and were spawned 43 minutes apart.
   *Change:* none to a file — a habit, not a rule. Worth one line in whatever
   guidance describes spawning: two agents whose inputs do not overlap go in one
   message.
   *Confidence:* medium; the wall-clock saving is real but small (~10 min here).
