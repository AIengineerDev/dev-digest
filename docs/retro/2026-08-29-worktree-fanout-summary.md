# Worktree fan-out — two features, three PRs

**2026-08-29 21:00Z → 2026-08-30 00:36Z · 3h 35m wall clock · ~1.96M subagent tokens · 21 agents**

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
