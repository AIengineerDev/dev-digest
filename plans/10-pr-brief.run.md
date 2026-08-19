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

- **J1 partly done 2026-08-19.** The stack was booted and the feature exercised
  against real seeded data — route registered, `GET` returns `200 null` before
  generation, one `POST` produced a grounded brief, three `POST`s left exactly
  one row and one model call ($0.005671 total). Still missing: the browser flow
  (`e2e/specs/12-pr-brief.flow.json`) and a run against an **indexed** repo — the
  seeded repo is not indexed, so the brief correctly reported
  `dropped_inputs: ['blast:degraded']` and the blast half of the card is
  unexercised.
- **MEASURED 2026-08-19, and worse than expected. The pre-flight gate
  undercounts by 228%.** First real generation against PR #482: our gate
  measured **612** tokens, Anthropic billed **2006**. The 1 394-token gap is the
  structured-output schema envelope, which is in neither `system` nor `user`, so
  `assembleBriefInput` cannot see it. Nothing is over budget today — 2 006 is
  well under 8 000 — but the gate is **unsound**: an input measuring 7 900 would
  be billed ~9 300 and pass. Fix is one of two: count a serialized copy of the
  response schema alongside the strings, or restate the ceiling with a named
  envelope allowance. This is exactly what the gpt-5 cross-model review
  predicted (`plans/10-pr-brief.cross-model-review.md`, risk 2). Recorded in
  `server/INSIGHTS.md`.

## Human decisions
- 2026-08-18 — all eight spec open questions resolved to their stated defaults.
- 2026-08-18 — cross-model review authorised against OpenAI `gpt-5`.
- 2026-08-18 — feature branched from `w6` (== `main` content) so the agent set
  it is built with exists on disk; PR base will be `w6`.
- 2026-08-18 — spec amendments recorded in-file rather than as a superseding
  spec, both single-clause.
- 2026-08-18 — "do everything except the video." The demo recording is the
  CTO's; this run produces the shot list and screenshots instead.
