# Multi-Agent Review — run

**Started:** 2026-08-29
**Plan:** plans/14-multi-agent-review.plan.md
**Spec:** specs/14-multi-agent-review.md
**Mode:** single implementer
**Worktree:** /Users/alexlavre/Documents/my-dev-digest/devdigest-review (`feat/multi-agent-review`)
**PR:** B — unordered against A and C

| Stage | State | Artifact / note |
| --- | --- | --- |
| build | done | Phases 1–10 + final gate. server 487 tests, client 343, build green |
| verify | done | 28 met · 1 partly met · 0 not met · 0 not checkable |
| review | round 1 fixed, re-review running | 4 findings fixed, gates green. Re-review + security pending |
| accept | pending | |
| ship | pending | |

## Unverified acceptance criteria

## Open findings

**Round 1 — four items, all confirmed, all four fixed. Re-review pending.**

1. **`AgentTabs` imports `FindingCard` from a sibling route's private `_components/`**
   (`.../multi-agent/[multiAgentRunId]/_components/AgentTabs/AgentTabs.tsx:10`). Medium.
   Inconsistent with `RunTraceDrawer`, promoted in this same commit for the same reason.
2. **`LatestMultiAgentRun` and `AgentEstimate` have no Zod contract**
   (`client/src/lib/hooks/reviews.ts:65,78`). Medium. The plan's `## Contract changes`
   lists five schemas and says "one phase, before anything else" — these two were never
   in it, so the plan left no slot for them. A plan defect, not implementer drift.
3. **`MultiAgentConfigPage` handles `isError` for one of four data hooks**
   (`client/src/app/repos/[repoId]/multi-agent/page.tsx:28-31`). Low.
4. **The per-agent retry button never renders** — `AgentColumn.tsx:45-51` implements it
   and `AgentColumn.test.tsx:67-80` tests it in isolation, but `page.tsx:143-148` never
   passes `onRetry`. Phase 8's done-when requires "a retry for that agent alone".
   Found by plan-verifier, invisible to the architecture review and to the unit test.

Carried from the implementer as product calls, not defects:

- `AgentPickerPopover` is a **second control beside** `Run Review ▾`, not merged
  into it — the vendored `Dropdown` has no children slot and `client/src/vendor/**`
  is do-not-touch, so one merged surface is not buildable. The plan's own audit
  says as much; the wording "above the existing items" was the only thing implying
  otherwise.
- **Agent colour and icon are synthetic.** `Agent` carries neither field, unlike
  the mock's `PERSONAS`. A position-based palette (`client/src/lib/agent-colors.ts`)
  and one generic icon stand in. Per-agent visual identity is a schema decision.
- **`FindingCard` now has two route consumers** without being promoted to
  `client/src/components/`. `frontend-ui-architecture`'s threshold says promote;
  Phase 8's file list did not authorise it. Flagged rather than done silently.

## Human decisions

- **2026-08-29** — A retried single agent gets `multi_agent_run_id: null` by
  construction (`server/src/modules/reviews/service.ts:139-140`), so it is not a
  member of the group and `listRunsForMultiAgentRun` will never return it. The
  retry therefore opens the trace drawer on the new run rather than refreshing the
  column. **Whether a retry should rejoin the group is a spec question**, recorded
  rather than answered.

- **2026-08-29** — Plan's import-depth arithmetic for the `RunTraceDrawer` move was
  wrong (`×8→×5`, `×10→×7`); the computed depths are `×3` and `×5`. Implementer used
  the computed values and recounted two `vi.mock` paths the plan did not mention.
- **2026-08-29** — `selectTargets` built generic (`<T extends {id:string}>`) rather
  than taking `AgentRow`: importing the row type into `helpers.ts` fires `pnpm arch`'s
  `helpers-are-pure` rule as a *new* violation. Confirmed by running the gate.

- **2026-08-29** — CTO: run both features now as worktree fan-out; PR A
  (`agent-runner`, plan 15 phases 1–2) merges first, then C; B is unordered.
- **2026-08-29** — Branch rebased onto `w8` (`a63d895`), which already contains
  `origin/main`, so the feature PR diff stays readable.
