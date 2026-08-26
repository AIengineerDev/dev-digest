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
| accept | done | pass 2 found 8 partly-met + 1 not met; pass 3 after the fixes: 34 met · 2 partly met · 1 not met (AS2, stretch) |
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

## Closed since pass 1

- **2026-08-26 — the pre-flight gate is now sound (spec amendment A-3).** The
  gate counted `system + user` only; the structured-output schema is sent as a
  tool definition / `response_format`, so it was structurally invisible to it.
  It now counts `system + user + briefSchemaEnvelope()` — derived from the same
  `BriefSchema`/`schemaName` through the same `toJsonSchema` the adapters use —
  and scales by `BRIEF_BILLING_SAFETY_FACTOR = 2`, which rounds the measured
  1.88 ratio up so the estimate over-states. Measured facts behind those
  numbers: the serialized schema is **456** `cl100k_base` tokens, which is only
  part of the 1 394-token gap; the rest is the provider's own encoder plus
  request framing, which nothing in-process can see — hence the factor rather
  than the count alone. The unit is now named in the spec: **billed provider
  input tokens**. Commit `3dcb8ac`.
- **2026-08-26 — four requirements shipped as prose but not as behaviour**,
  found by verify pass 2 and absent from this record until now. Commit
  `487fbb4`:
  - **R8** — risk pills rendered the explanation inline and never rendered
    `file_refs` at all. The refs are what makes a risk checkable. The pill is
    now a disclosure and each ref is a jump-to-diff control.
  - **A17** — the fallback test was unfalsifiable: its fixture `kind`
    (`concurrency`) is in `RISK_ICON`, so it exercised the happy path under the
    fallback's name. Fixture now uses an unmapped kind, and the raw `kind` is
    rendered as `helpers.ts` already claimed.
  - **R6 / amendment A-2** — implemented on the client and never on the server.
    `if (existing && !existing.degraded)` meant an ordinary `POST` at a matching
    key re-billed a generation on every page view while a provider was down.
  - **R10** — `budget_tokens` was `0` on the `input_over_budget` path, the one
    record where the number is the diagnostic.
- **2026-08-26 — A7's browser lane exists** (`e2e/specs/12-pr-brief.flow.json`),
  with a seeded brief so the flow never makes a model call. Commit `ea0347b`.

## Open findings

- **J1 partly done 2026-08-19.** The stack was booted and the feature exercised
  against real seeded data — route registered, `GET` returns `200 null` before
  generation, one `POST` produced a grounded brief, three `POST`s left exactly
  one row and one model call ($0.005671 total). Still missing: the browser flow
  (`e2e/specs/12-pr-brief.flow.json`) and a run against an **indexed** repo — the
  seeded repo is not indexed, so the brief correctly reported
  `dropped_inputs: ['blast:degraded']` and the blast half of the card is
  unexercised.
- **RESOLVED 2026-08-26 by amendment A-3 — see *Closed since pass 1*.**
  Original finding, kept for the record: **MEASURED 2026-08-19, and worse than
  expected. The pre-flight gate undercounts by 228%.** First real generation against PR #482: our gate
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

## Still open after verify pass 3

- **A8's browser lane.** The seed has one PR and it now carries a brief, so
  there is no un-briefed PR to land the "offer to generate" state on. The unit
  test covers it; the flow cannot.
- **The `*.it.test.ts` lane was not executed in the closing session** — Docker
  was unavailable, so `brief.it.test.ts` self-skips (13 tests, covering A1, A10,
  A11, A13, A18 and the new R6/A-2 assertion). Pass 1 reports having run the
  earlier twelve. The R6 assertion added on 2026-08-26 has never been executed.
- **J1's real-repo check** — a brief against an actually imported *and indexed*
  repo. Unchanged: needs a running stack and a real token. The blast half of the
  card is still unexercised end to end.
- **C11's Back-button behaviour** — still code inspection only; there is no
  `page.test.tsx` in this codebase.
- **AS2 (Why Timeline history view)** — stretch, deliberately unbuilt.
- **A-3's residual accuracy** — the ×2 factor is calibrated on ONE generation.
  Whether it bounds the bill across providers and PR sizes needs real calls.
  The spec says so, and says widen it, never narrow it.

## Human decisions (continued)
- 2026-08-26 — the token gate closes by counting the schema envelope
  *and* applying a named safety factor. Counting the envelope alone was the
  authorised option; it removes only 456 of the 1 394-token gap, so it would
  have left the gate unsound in the same way, and the factor was added to
  finish the job. Recorded here because it goes beyond what was approved.
