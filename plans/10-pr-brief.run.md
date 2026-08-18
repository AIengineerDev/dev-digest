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
| build · prelude | done | P0 contract, P1 schema + `_shared/file-roles.ts` |
| build · track A | done | A1 wire · A2 assembly · A3 model call |
| build · track B | done | B1 hooks · B2 card · B3 focus jump |
| build · join | not done | J1 (e2e flow + real indexed repo) — see Open findings |
| verify | done | pass 1: 36/39 met. The one `not met` (A18) is now fixed and pinned |
| review | pending | architecture-reviewer + /security-review |
| accept | pending | plan-verifier pass 2 vs the spec |
| ship | in progress | PR opened; doc-writer not run |

## Unverified acceptance criteria

Carried from verify pass 1. Nobody is writing these tests in this chain — no
test-writer stage — so they travel to the end of the run and get reported.

- **A1's missing-provider-key sub-clause** — the `ConfigError` path from
  `container.llm()` is exercised only indirectly, by a throwing provider mock
  (A10/C6). Same `try/catch`, different trigger.
- **C11's Back-button behaviour** — `router.push` vs `.replace` is asserted by
  code inspection at `page.tsx:86,163`, not by a history-stack test. There is no
  `page.test.tsx` in this codebase. Would have been J1's job.
- **J1's real-repo check** — generating a brief against an actually imported and
  indexed repository needs a running stack and a real token.
- **S1/S2 (Why Timeline)** — stretch, deliberately unattempted.

## Open findings

- **J1 not run.** No `e2e/specs/12-pr-brief.flow.json`, and the manual real-repo
  check has not happened. Both tracks are green in isolation and together, but
  the feature has not been driven through a browser.
- **`cl100k_base` drift is still unmeasured.** The 8 000-token gate is enforced
  by our counter; the provider's own `usage.input_tokens` is now persisted, so
  the first real generation will show the gap. Until then 8 000 is a bound we
  enforce, not one we have proven matches billing.

## Human decisions
- 2026-08-18 — all eight spec open questions resolved to their stated defaults.
- 2026-08-18 — cross-model review authorised against OpenAI `gpt-5`.
- 2026-08-18 — feature branched from `w6` (== `main` content) so the agent set
  it is built with exists on disk; PR base will be `w6`.
- 2026-08-18 — spec amendments recorded in-file rather than as a superseding
  spec, both single-clause.
- 2026-08-18 — "do everything except the video." The demo recording is the
  CTO's; this run produces the shot list and screenshots instead.
