# Onboarding Generator plan — cross-model review

**Reviewed:** `plans/12-onboarding-generator.plan.md` against `specs/12-onboarding-generator.md`
**Reviewer:** `gpt-5-2025-08-07` (OpenAI) — a different model family from the
`claude-opus-5` that wrote both the spec and the plan
**Date:** 2026-08-26 · **Cost:** 48,369 input / 9,853 output tokens, one call
**Method:** the reviewer was given the spec and the plan as text and **no
repository access**, and was told to say what it could not verify rather than
guess. Its section 6 is that list, and it is honest — it correctly declines to
confirm a dozen claims that do hold.

Findings below are the reviewer's. **Verified** means I checked it against the
spec, the plan or the code afterwards; an unverified cross-model finding is a
second opinion, not a fact.

## Confirmed — these change the plan

### 1. "How to run" has no defined ordering on the success path

The reviewer: R4 calls how-to-run *"the one section whose content is written
rather than assembled"*, which implies the model controls sequence and
inclusion subject to the whitelist. The plan fixes an order in the **skeleton**
(A2.8: `install → cp .env.example .env → docker compose up -d … → <pm> dev`) and
never says what happens to that order when the call succeeds.

**Verified.** `specs/12-onboarding-generator.md:161` is R4's exact wording. The
plan's A4.4 merge rule covers `guided_reading` order explicitly ("the order is
the skeleton's") and says nothing about `run_steps`. No acceptance criterion
covers run-step ordering on the success path.

This is the sharpest finding in the review. Left as-is, two implementers would
build opposite behaviour and both would pass every named test. It also has a
real failure mode the reviewer names: forcing the skeleton order on success can
print `docker compose up -d` after `<pm> dev`.

**Applied:** A4.4 gains an explicit rule and A3.3 an explicit constraint — see
*Corrections applied* below.

### 2. R10's backticked-path clause has no test

The reviewer: `grounding.ts` is specified to check *"any backticked path inside
a `body`"* (A4.1), but the matrix's A2 row cites only `src/does-not-exist.ts`
as a plain path in fixture output. Nothing proves a backticked path inside prose
is detected.

**Verified.** The A2 row reads `tour-grounding.test.ts — src/does-not-exist.ts
absent, dropped_refs === 1`. The backticked case is the one an implementer is
most likely to skip, because it needs a regex over prose rather than a field
walk — and it is the case that matters, since prose is the only thing the model
writes freely.

**Applied:** A4.1's *Done when* gains the case.

### 3. Track B's stale marker depends on Track A, and the plan says it does not

The reviewer: B3.3 renders the stale marker from fields the server adds in
**A5.2** (`current_indexed_sha`, `index_status`, `files_skipped`), but Track B
is declared to depend on **T1 only**, and B3's own *Depends on* says **B2**.
Either B3.3 reads the existing `useRepoIntelStatus` hook, or B3 depends on A5.2.

**Verified.** Track B's header says *"Depends on: T1 only — not on Track A"*;
Phase B3 says *"Depends on: B2"*. B3.3 as written needs A5.2's response fields.
This is the one genuine ordering error in the plan, and it is exactly the class
of defect the PR Brief run hit for real — a clause both sides encode, landing on
one side only (root `INSIGHTS.md:356-369`).

**Applied:** B3.3 now reads `useRepoIntelStatus`, which Track B already uses in
B1.4 for the not-indexed state, keeping the tracks genuinely independent.

## Confirmed but not acted on — recorded instead

### 4. The contract carries fields the spec's Contract changes never lists

`resolved` per item, `empty_reason` and `skeleton` per section, and
`current_indexed_sha` / `index_status` / `files_skipped` on the GET response are
all in the plan's contract block and none is in the spec's *Contract changes*.

**Verified.** The spec's list names `degraded`, `error`, `skeleton_sections[]`,
`dropped_inputs[]` and the trace fields, and stops there.

**Not applied, deliberately.** Every one of these is load-bearing for a
requirement the spec *does* state — `resolved` is R11, `empty_reason` is R23's
named-message rule, `skeleton` is R24, and the three GET fields are R13's stale
marker and R18's partial-index banner. The plan is more complete than the spec's
contract table, not in conflict with it. Recorded as a spec question rather than
silently reconciled: the honest fix is a clause in spec 12's *Contract changes*,
which is `specreator`'s to write, not the planner's or mine.

### 5. Q4 is a rollout risk, not only an open question

The reviewer: using the absent `OPENROUTER_API_KEY` as a live demonstration of
the skeleton (J1 generation 1) is sound as a test, but it is also *"the
product's first impression for many users"* — a degraded page by default, on
every repo, with no decision deadline attached.

**Verified as a judgement, and it is right.** The plan already routes this to
the CTO and says J1 generation 1 is the evidence to bring. What it does not do
is call it a release risk. Recorded here so the decision has a name.

## Refuted — checked and wrong

**"Sorting first tasks by difficulty ascending is only *proposed*, with no AC."**
It is normative: `specs/12-onboarding-generator.md:368`, corner case **C8** —
*"Order is difficulty ascending."* The reviewer saw the `proposed` UX item at
`:301` and missed the corner case that settles it. The plan is correct to bake
it into A2.8.

## Under-weighted risks worth carrying

- **`getTopFilesByRank`'s `exclude` is a substring match, not a path match.** The
  plan notes the mechanic in A2.5 and draws no risk from it. A short path
  fragment can silently drop unrelated files from the guided reading list, which
  degrades R6 without failing anything. No AC covers over-exclusion.
- **`file_facts.endpoints` may be empty in practice.** The plan checks this only
  at J1 step 5. If empty, R3's endpoint annotation and R8's
  `undocumented_endpoint` generator both quietly yield nothing.
- **Read-time re-resolution is on every `GET`** and the 400 ms warm bound is
  assumed, not measured, with no guard proposed beyond a note.

## What the reviewer could not verify

Its own list, and it is accurate: every cited `path:line`, the dependency-cruiser
rules and whether the facade passthroughs satisfy them, the 10-entry arch
baseline, whether `nav.ts` may be edited, the existence of
`useRepoIntelStatus` / `useResyncRepoIntel`, the pricing entry for
`deepseek/deepseek-v4-flash`, `SimpleGitClient.readFile`'s ENOENT behaviour,
`MermaidDiagram`'s validation, and whether the seeded demo can exercise
`repo-intel`. All of these were verified by the planner against the repository
and are recorded in the plan's *Context read* table with line numbers.

## Corrections applied to the plan

| # | Correction | Where |
| --- | --- | --- |
| C-1 | On the success path, `run_steps` order is the **model's**, filtered to whitelist membership; only the skeleton uses the fixed order. Stated in the merge rule, with an AC. | A4.4, A3.3 |
| C-2 | `groundPaths`'s *Done when* now includes an unresolvable **backticked path inside a `body`**, dropped and counted. | A4.1 |
| C-3 | B3.3 reads `useRepoIntelStatus` rather than A5.2's response fields, so Track B depends on T1 only, as declared. | B3.3 |
