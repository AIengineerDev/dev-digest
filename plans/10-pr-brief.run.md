# PR Brief — run

**Started:** 2026-08-18
**Plan:** plans/10-pr-brief.plan.md
**Spec:** specs/10-pr-brief.md (agreed, amended A-1/A-2)
**Mode:** tracks A (server) + B (client), after a single-threaded P0→P1 prelude
**Branch:** task/10-pr-brief

| Stage | State | Artifact / note |
| --- | --- | --- |
| spec | done | `specs/10-pr-brief.md` — committed before any code |
| plan | done | `plans/10-pr-brief.plan.md` — committed before any code |
| cross-model review | done | gpt-5; 1 blocking finding verified in code; corrections C-1..C-4 applied |
| build · prelude | pending | P0 contract, P1 schema + `_shared/file-roles.ts` |
| build · track A | pending | A1 wire · A2 assembly · A3 model call |
| build · track B | pending | B1 hooks · B2 card · B3 focus jump |
| build · join | pending | J1 |
| verify | pending | plan-verifier pass 1 vs the plan |
| review | pending | architecture-reviewer + /security-review |
| accept | pending | plan-verifier pass 2 vs the spec |
| ship | pending | PR + doc-writer |

## Unverified acceptance criteria
_Populated by verify pass 1. No test-writer in this chain by design._

## Open findings
_None yet._

## Human decisions
- 2026-08-18 — all eight spec open questions resolved to their stated defaults.
- 2026-08-18 — cross-model review authorised against OpenAI `gpt-5`.
- 2026-08-18 — feature branched from `w6` (== `main` content) so the agent set
  it is built with exists on disk; PR base will be `w6`.
- 2026-08-18 — spec amendments recorded in-file rather than as a superseding
  spec, both single-clause.
- 2026-08-18 — "do everything except the video." The demo recording is the
  CTO's; this run produces the shot list and screenshots instead.
