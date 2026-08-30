# Export to CI v1 — run

**Started:** 2026-08-29
**Plan:** plans/15-export-to-ci.plan.md
**Spec:** specs/15-export-to-ci.md
**Mode:** single implementer
**Worktree:** /Users/alexlavre/Documents/my-dev-digest/devdigest-ci (`feat/export-to-ci`)
**PR topology:** A = phases 1–2 (`agent-runner`) — **#22, based on `w8`**, merges first.
C = phases 3–7 — branch `feat/export-to-ci-product`, **stacked on A**.

| Stage | State | Artifact / note |
| --- | --- | --- |
| build | done (A and C) | A: phases 1–2. C: phases 3–7 — `ci` module, CI tab, export wizard, delete-cascade warning |
| verify | done (A) · pending (C) | A: 25 met · 1 partly · 0 not met · 2 not checkable |
| review | done (A) · pending (C) | A: architecture clean; security 3 candidates, 0 survived |
| accept | pending | |
| ship | pending | |

## Unverified acceptance criteria

The plan forbids the implementer from writing tests (`plans/15-export-to-ci.plan.md:14-27`).
Every `Done when` in phases 1–7 is asserted by inspection and left unproven. Verifier
pass 1 named these precisely, and **nobody in this chain will write them** —
`test-writer` is out of `/impl` by an existing cost decision:

- **A9** (`specs/15-export-to-ci.md:325`) — running the runner against a fixture
  checkout with a stubbed LLM posts a review and exits `1`/`0` by `ci_fail_on`.
  `Verify by: agent-runner test`; no such suite exists. The gate arithmetic was
  exercised by hand against a stubbed HTTP endpoint, not end to end.
- **A12**, runner half (`specs/15-export-to-ci.md:328`) — that `$(id)`, backticks
  and `${{ github.token }}` appear in the assembled prompt *only* inside the
  untrusted wrapper. Confirmed by reading every `wrapUntrusted` call site in
  `reviewer-core/src/prompt.ts`; no test snapshots the rendered prompt.
- Phase 2's end-to-end claim ("reviews a fixture PR with a stubbed LLM, posts a
  review") is **partly met**: the wiring exists and the bundle builds, but no
  stubbed-LLM run was performed.
- A real OpenRouter call and a real GitHub `postReview` — no credentials in this
  environment. Structural verification only.

## Open findings

None. The fix loop closed in round 1 with no remediation work.

Two items deliberately carried forward rather than fixed in PR A:

- **Low-severity hardening** — a `^[a-z0-9][a-z0-9-]*$` slug check plus `realpath`
  containment in `loadSkill` (`agent-runner/src/review.ts:43`). Not a vulnerability
  today because fork PRs skip and the remaining actor already has repo write access;
  becomes one the moment anything emits `pull_request_target`, which the spec forbids.
- **Docs gap for PR C, phase 6** — R6 tells the user to make the check required in
  branch protection but never to protect `.devdigest/**` with CODEOWNERS. The export
  wizard's Configure step should say so.

## Human decisions

- **2026-08-29** — CTO: split `agent-runner` into its own PR and merge it first,
  so the product PRs stay readable. The plan already encodes this at
  `plans/15-export-to-ci.plan.md:97-120`.
- **2026-08-29** — Branch rebased onto `w8` (`a63d895`).

## PR C — what the takeover found

Two implementers were killed by a 600s no-output watchdog partway through
phases 3–7; a third finished from their uncommitted work. What it inherited was
sound but incomplete, and the gap was larger than the stall point suggested:

- Phases 3 and 4 (`ci` module: generate, install) were **complete and correct**.
- Phase 5 (CI tab) was complete but called two i18n keys that did not exist —
  `ci.loadFailed` and `ci.ciTab.activeCount` — which would have rendered
  next-intl fallback text rather than failing a gate.
- **Phase 6 (the export wizard) did not exist at all.** `CiTab.tsx` carried
  `{wizardOpen && null /* Export wizard modal — Phase 6 */}`. Built from scratch.
- **Phase 7 (delete-cascade warning, R15) had not started.** `AgentCard.tsx` was
  untouched, still on a hardcoded English `window.confirm`.

Three stalls cost roughly 40 minutes of wall clock. All three followed long
silent command chains; the run that succeeded was told to run gates one at a
time and to print a progress line before each.
