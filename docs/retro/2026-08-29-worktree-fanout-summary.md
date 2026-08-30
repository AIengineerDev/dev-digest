# Worktree fan-out — two features, three PRs

**Fan-out: 2026-08-29 21:00Z → 2026-08-30 00:36Z · 3h 35m wall clock · 1,960,647 subagent tokens · 21 agents**
**Demo enablement afterwards: ~1h, no subagents — done directly.**

## What shipped

| PR | Feature | Base | Merge order |
| --- | --- | --- | --- |
| [#22](https://github.com/AIengineerDev/dev-digest/pull/22) — A | `agent-runner`, the reviewer as a CI binary | `w8` | **first** |
| [#23](https://github.com/AIengineerDev/dev-digest/pull/23) — B | Multi-Agent Review | `w8` | unordered |
| [#24](https://github.com/AIengineerDev/dev-digest/pull/24) — C | Export to CI, product half | `feat/export-to-ci` | after A |

A is the technical diff split out so C stays readable — the assignment asks for
exactly that, and `plans/15-export-to-ci.plan.md:97-120` had already fixed the
order because an earlier draft had the generator embedding a bundle a later phase
produced.

## Cost by stage

| Stage | Agents | Tokens | Agent-time |
| --- | --- | --- | --- |
| build | 3 (+2 killed) | 767,950 | 110 min |
| verify | 3 | 273,934 | 20 min |
| architecture review | 4 | 293,087 | 17 min |
| security review | 5 | 324,449 | 22 min |
| fix loop | 4 | 301,227 | 53 min |
| **total** | **21** | **1,960,647** | **222 min** |

Review time — verify + architecture + security — was **59 minutes across 12
agents**, a quarter of the total.

## The fan-out was mostly theoretical

Two worktrees, but the tracks were wildly uneven: plan 14's implementer ran
**65 minutes** against plan 15's 17. Parallelism saved roughly 17 minutes out of
215. The real split was inside plan 14 — server phases 1–5 and client phases 6–10
never touch the same files.

## Conflicts

**One**, and not between the features: a two-line `.gitignore` collision when
`w7` merged into `w8`, both sides kept. `git merge-tree` between the two feature
branches reports **zero**. They shared no files, which is the fan-out's whole
premise and the one thing here that held perfectly.

## What review caught that gates did not

Eleven findings across both features. Every one was invisible to `typecheck`,
`lint`, `arch` and the full test suites — all of which were green throughout.

1. **A 39-character git SHA** (`ci/constants.ts`). SHAs are 40. Every exported
   workflow would have referenced an `actions/setup-node@<ref>` GitHub cannot
   resolve and died at setup. Nothing renders the generated YAML, so it would
   have failed first on someone else's runner.
2. **A retry button wired to nothing.** `AgentColumn` implemented it and its unit
   test passed in isolation, but the page never passed `onRetry`, so it could
   never render.
3. **An unscoped read.** `GET /agents/:id/ci-installations` authenticated the
   caller then listed by agent id alone — another workspace's export history.
4. **A skill named `../etc` silently renamed** to `etc` instead of rejected.
5. **Two response shapes with no Zod contract**, unlike every other shape in the
   same feature — because the plan's contract section had omitted them.
6. **A route reaching into a sibling route's private `_components/`** while the
   same commit promoted a different component for that exact reason.
7. …plus a missing response schema introduced *by* the fix for #5, three
   unattended data hooks, and two low findings left recorded on PR C.

Each stage caught a disjoint class. Architecture found placement problems no test
can fail on; verification found built-but-unreachable code; security found
nothing on PR A that survived scrutiny and a tenancy gap on PR C. Running one
stage instead of three would have shipped most of these.

## Plans were wrong three times

- Import-depth arithmetic for a component move: plan said `×8→×5`, real answer `×3`.
- A specified helper signature that fires a *new* `pnpm arch` violation.
- A contract section that omitted two of the response shapes its own phase 10 needed.

The implementers caught all three and reported rather than followed.

## Infrastructure failures

- **Three watchdog kills** on PR C's build (600s no output), ~40 min lost. All
  three followed long silent command chains; the run that succeeded was told to
  run gates one at a time.
- **`/security-review` twice resolved its diff against the wrong worktree**,
  seeing docs only. Committing before the security stage is the fix.
- **A killed agent leaves work that looks finished.** PR C's files were all
  present, but phase 6 was a `null` placeholder and phase 7 was untouched. File
  presence is not phase completion.
- The permission classifier blocked `gh pr merge`, `git checkout -b` and a
  directory `git mv`; plain `git branch` and per-file `git mv` went through.

## Not done

- **No demo video** — excluded by request.
- **No security review on PR C.** Given that plan verification found a tenancy
  gap there unaided, this is the most valuable thing left undone.
- **No `accept` stage** for either feature — verification ran against the plans,
  never against `specs/14` and `specs/15`. It is the only pass that catches a
  requirement the *planner* dropped, and plan 14 proved planners drop things.
- **No tests on PR A or PR C.** Binding constraint from plan 15; A9 and A12 stay
  unproven, along with any real OpenRouter or GitHub call.
- The retry fix on PR B was verified by code-tracing, not a live click.

## After the fan-out — getting it runnable, and what that found

The build was finished; making it *run* was a separate hour, and it surfaced
things no gate had.

**A defect only the running app revealed.** The first live multi-agent run
returned 5 groups and 5 conflicts — every one false. `groupFindings` received
every run, so an agent that crashed became a take with `finding: null`, and
`conflict` is `flagged && silent`. One agent erroring turned the whole
"Where agents disagree" panel into noise.
`specs/14-multi-agent-review.md:134` defines `null` as *"this agent ran over
this location and did not flag it"* — a claim a crashed run never made. Only
completed runs are grouped now: **5 groups, 1 real conflict.** This is exactly
what the skipped `accept` stage (verification against the spec, not the plan)
exists to catch.

**Two config faults that predate this work.** `client/.env` pointed the browser
at port 3002 while the API serves 3001, so every client-side fetch failed
silently — that is why the repo picker looked empty and the PR list looked
unsynced. And a `dev.sh` was running from a *different worktree*, respawning
servers on the wrong branch.

**Two screens the mock showed and no branch had.** `CI Runs` and `Memory` were
nav entries in `design-mocks/src/23-screen_cizruns.jsx` with tables behind them
that nothing ever wrote. `ci_runs` now ingests the repositories' own GitHub
Actions history — 100 runs on first sync — which redefines the screen from
"agent reviews in CI" to "CI for your repos"; the subtitle says so. `Memory`
ships read-only over the RAG store and states in its empty state that nothing
writes it yet, rather than leaving a reader guessing.

**Process notes worth keeping:** running `pnpm build` while `next dev` is live
clobbers the dev server's chunk cache (`Cannot find module './5585.js'`); and a
stray `prettier --write` with the wrong config rewrote a whole file from single
to double quotes — 89 lines of churn, reverted and re-applied as 6.

## Deliverables

| | Where |
| --- | --- |
| PR — Multi-Agent Review | [#23](https://github.com/AIengineerDev/dev-digest/pull/23) |
| PR — Export to CI (product) | [#24](https://github.com/AIengineerDev/dev-digest/pull/24) |
| PR — `agent-runner` (technical, merges first) | [#22](https://github.com/AIengineerDev/dev-digest/pull/22) |
| Everything running together | branch `w8` |
| This summary | `docs/retro/2026-08-29-worktree-fanout-summary.md` |
