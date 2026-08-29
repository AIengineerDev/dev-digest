# Export to CI v1 — run

**Started:** 2026-08-29
**Plan:** plans/15-export-to-ci.plan.md
**Spec:** specs/15-export-to-ci.md
**Mode:** single implementer
**Worktree:** /Users/alexlavre/Documents/my-dev-digest/devdigest-ci (`feat/export-to-ci`)
**PR topology:** A = phases 1–2 (`agent-runner`), merges first. C = phases 3–7.

| Stage | State | Artifact / note |
| --- | --- | --- |
| build | done (PR A) | Phases 1–2 landed: `agent-runner/` package, ncc bundle 952kB. Phases 3–7 resume after A merges |
| verify | done (PR A) | 25 met · 1 partly met · 0 not met · 2 not checkable |
| review | round 1 of ≤2 | architecture-reviewer + /security-review on `agent-runner/` |
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

## Human decisions

- **2026-08-29** — CTO: split `agent-runner` into its own PR and merge it first,
  so the product PRs stay readable. The plan already encodes this at
  `plans/15-export-to-ci.plan.md:97-120`.
- **2026-08-29** — Branch rebased onto `w8` (`a63d895`).
