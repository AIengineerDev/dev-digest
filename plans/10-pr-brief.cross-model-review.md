# PR Brief plan — cross-model review

**Reviewed:** `plans/10-pr-brief.plan.md` against `specs/10-pr-brief.md`
**Reviewer:** `gpt-5-2025-08-07` (OpenAI) — a different model family from the
`claude-opus-5` that wrote both the spec and the plan
**Date:** 2026-08-18 · **Cost:** 33,723 input / 9,221 output tokens, one call
**Method:** the reviewer was given the spec and the plan as text and **no
repository access**, and was told to say what it could not verify rather than
guess. Its section 6 is that list, and it is honest — it correctly flagged as
unverifiable several claims that do hold.

Findings below are the reviewer's. **Verified** means I checked it against the
code afterwards; an unverified cross-model finding is a second opinion, not a
fact.

## Confirmed against the repo — this one changes the plan

**Smart Diff file roles cannot come from a database projection.** The plan's
Phase A3 selects `path/additions/deletions/role` from `pr_files` while also
forbidding imports of `modules/smart-diff` internals. The reviewer called this
"infeasible or contradicts the stated provenance".

Verified: `pr_files` (`server/src/db/schema/pulls.ts:36-42`) has `path`,
`additions`, `deletions` and **no `role`**. Role is computed per request from
path patterns at `server/src/modules/smart-diff/helpers.ts:43` against
`smart-diff/constants.ts`. The only `role` column in the schema is workspace
membership (`schema/core.ts:28`).

So A3 is not buildable as written. The repo already has the answer, used once
in this exact situation: move the classifier to `modules/_shared/`, the same
move `plans/09-project-context.plan.md` Phase T3 makes for the walk limits,
because `no-cross-module-internals` forbids the direct import and a copied
pattern list silently drifts. **This must be fixed before Phase A3 runs.**

## Real, and worth acting on

| # | Finding | Assessment |
| --- | --- | --- |
| 1 | **`maxRetries: 1` still violates R3's "no second call".** Counting *invocations* rather than HTTP requests is, in the reviewer's words, "budget-policy sleight of hand" — a retry is a second billed request, so the worst case is 2 × 8 000 input tokens, not 1 × 8 000. | Correct as a matter of cost. The plan does state this consequence, but states it as an aside. Either set `maxRetries: 0` and treat a malformed response as a degradation, or amend R3 to say "one invocation, at most one adapter retry". Silence is the one option that is wrong. |
| 2 | **The token gate can undercount by the structured-output schema.** The pre-flight count covers the system and user strings; the provider also bills the tool/schema envelope, so `usage.input_tokens` may exceed 8 000 while the local gate passed. | Real, and the plan does not mention it. It does not break the design — the spec already records both numbers so the drift is visible — but the first run should be checked against a real `usage.input_tokens` before the 8 000 figure is treated as proven. |
| 3 | **Empty-string sentinels in a composite primary key are brittle.** `''` for a missing `intent_fingerprint` / `repo_indexed_sha` collides with a legitimately empty value and produces cache behaviour that is hard to debug. | Fair. A nullable column outside the PK, or an explicit discriminator, is safer. Low cost to change now, high cost to debug later. |
| 4 | **The injection guard is replicated, not reused, and the test only asserts the wrappers are present** — not that they work. "If that equivalence is imperfect, wrappers are decorative." | The sharpest finding in the review. The test should assert the guard's *effect* on a hostile string, not the presence of delimiters. |
| 5 | **R6's "unless degraded" exception changes the contract.** The spec says a matching key returns the cached row; the plan regenerates when the cached row is degraded. | Correct. Either mark the Retry button as `force=true` and leave R6 alone, or amend R6. |
| 6 | **R9 `router.replace` vs C11's back button** — the plan chose `push`, which contradicts R9 as written. | The plan already flagged this and put it in Recommendations. The reviewer independently reached the same conclusion, which raises confidence that the *spec* is what needs the edit. |
| 7 | **A12 loses its server half.** The spec asks for a server hermetic test over the same scope helper Smart Diff uses; the plan derives the counts on the client and drops that half. | Correct that the criterion is not met as written. The plan's reasoning — the persisted record has nowhere to put counts, and cached counts would go stale — is sound, so the honest fix is to amend A12, not to add the test. |

## Where the reviewer was wrong, or could not have known

- **"`client/` has no ESLint" being void** — the plan already corrected this; the
  reviewer listed it under what it could not check. Both were right to flag it.
- Most of section 6 is accurate about its own limits: it could not verify the
  dead `pr_brief` table, `container.github().getIssue`, `check-shared.sh`
  behaviour, or the arch rule's treatment of type-only imports. All of those do
  hold, and the plan cites `path:line` for each.
- It did not find a problem with the drop-order or budget-arithmetic findings the
  plan's own audit had already caught, which is mild evidence those were real.

## What changes before implementation

1. **Fix Phase A3** — move the Smart Diff classifier to `modules/_shared/` and
   compute roles, rather than selecting a column that does not exist. Blocking.
2. **Decide `maxRetries`** — 0, or amend R3. Not blocking, but it is a cost
   claim in the acceptance criteria.
3. **Assert the injection guard's effect**, not the presence of its wrappers.
4. **Drop the `''` sentinels** from the primary key.
5. **Amend R6 or use `force=true`**; amend R9 and A12, both of which the plan
   and the reviewer independently agree are wrong in the spec rather than in the
   plan.

Items 1, 3 and 4 are plan edits. Items 2 and 5 are spec edits, and a revised
spec is a new numbered file — `specreator` cannot amend an agreed one.
