# Insights — cross-package

Decisions that span more than one package, and things we tried that did not
work. Module-local lessons go in `<module>/INSIGHTS.md` instead.

Read at the start of a task, written at the end of one, by the
`engineering-insights` skill. Sections are fixed — add to the one that fits,
newest first. Every entry must be actionable cold: claim first, `path:line` or a
runnable command last. If it would be obvious to anyone reading the code, leave
it out.

Roughly 5 entries per section. When an entry becomes stable reference material,
move it into `docs/` and delete it here.

---

## Decisions

### 2026-08-09 — Legacy rows are read tolerantly, never migrated

**What:** `AgentVersionConfig.skills` accepts both the legacy bare id (`"s1"`)
and the pinned `{ id, version }` form, and normalises both to `SkillRef[]` via
`.transform()`; a legacy row yields `version: null`.
`server/src/vendor/shared/contracts/knowledge.ts:153`
**Why:** the snapshots in `agent_versions` are immutable history. Null means "we
do not know which skill text this ran with", which is true; a backfill would have
to invent a version number and would make a replay claim reproducibility it does
not have.
**Rejected:** a data migration rewriting existing `config_json.skills`. The catch
is that a `.transform()` on a Zod object field splits input from output type, so
nothing on the *write* side is forced to change — `snapshotVersion` still writes
bare ids into an untyped `jsonb` column and typechecks
(`server/src/modules/agents/repository.ts:192`). The union is therefore the whole
migration story and the only thing standing between an existing workspace and a
runtime parse failure; it is pinned by `server/test/skills-contracts.test.ts`,
which fails on 4 of 9 cases if the union is reverted to `z.array(z.string())`.

### 2026-08-07 — Runs and reviews are stamped with the head they reviewed

**What:** `agent_runs.head_sha` and `reviews.head_sha` (migration `0011`, both
nullable) are written from `pull.headSha` when the run is created, exposed as
`head_sha` on `RunSummary` and `ReviewRecord`, and used by the PR detail page to
mark stale runs and to hide non-current review runs by default.
**Why:** findings outlive the code they describe. A PR reviewed over many pushes
accumulated runs whose findings pointed at files that had since been deleted,
displayed identically to findings about the current code — the symptom that read
as "DevDigest doesn't see the latest changes". Nothing recorded which revision a
run had seen: `pull_requests.last_reviewed_sha` is a single value, overwritten by
each run and used only to derive the list's `needs_review` status
(`server/src/modules/pulls/status.ts:51`).
**Rejected:** (a) deleting or auto-hiding old reviews when the head moves —
findings on a rewritten file are still evidence about the PR's history, and
deletion is unrecoverable; (b) inferring staleness from timestamps against
`pr_commits` — a run started before a push can legitimately be reviewing the new
head, and the ordering is wrong precisely in the interesting cases. **A null sha
never means stale**: rows written before `0011` carry null, and treating unknown
as stale would flag a repo's entire history. `client/src/app/repos/[repoId]/pulls/[number]/_components/staleness.ts:16`

### 2026-07-31 — Standalone packages instead of a workspace

**What:** four packages, each with its own `package.json` and lockfile; sharing
happens through tsconfig path aliases, not published modules. Each suite is
gated by its own CI workflow with a path filter.
**Why:** _rationale not recorded anywhere in the repo — fill this in._ Do not
"fix" this into a workspace before that gap is closed; it is load-bearing for the
per-package CI path filters.

### 2026-07-31 — Zod contracts as the single source of truth

**What:** `@devdigest/shared` schemas drive request validation, response
serialization, and client-side types.
**Why:** one definition, no drift between server and client.
**Rejected:** hand-rolled `Schema.parse(req.body)` inside handlers — it validated
input but left responses unchecked, so contract drift surfaced in the browser.

## What Works

- **2026-08-09** — When a spec's contract field list and its acceptance
  criteria disagree, the acceptance criteria win, not the literal enumeration.
  `specs/04-intent-layer.md` §4 spells `DerivedIntent` as `Intent.extend({
  category, summary, confidence, band, sources, provider, model,
  prompt_version, fingerprint, derived_at, degraded })` — no `error` — but §7
  requires the UI to render `"Not derived — <error>"` for a degraded row, and
  §3's schema lists `error` as a real column. Added `error: z.string().nullish()`
  to `DerivedIntent` despite the omission; a strictly-literal reading would have
  shipped a degraded card with no error text. Cross-check a contract's `.extend`
  list against every acceptance criterion that reads the type before treating
  the list as exhaustive. `server/src/vendor/shared/contracts/brief.ts` (`DerivedIntent`).

## What Doesn't Work

_None yet._

## Codebase Patterns

- **2026-08-10** — The 2026-07-31 decision below says "each suite is gated by
  its own CI workflow with a path filter". **There is no CI in this repository**
  — no `.github/` directory exists on disk and `git ls-files` tracks no workflow
  file. Verified 2026-08-10. So every gate is a local command a human or an
  agent must remember to run: `pnpm typecheck`, `pnpm test`, and in `server/`
  also `pnpm arch` (which does fail correctly — 11 known violations, exit code
  11). Two consequences: do not write a skill, hook, or doc that says "CI will
  catch this", and when adding the workflows later, the path filters the old
  entry describes still have to be invented, not restored. `server/package.json:11`

- **2026-08-10** — Before authoring a skill in `.claude/skills/`, read the
  existing ones — "React/frontend best practices" was requested and would have
  duplicated `frontend-ui-architecture`, which already answers where components,
  constants, helpers and business logic go. The boundary that keeps the two
  apart is worth stating: that skill owns **where code goes**, a second one may
  only own **how it behaves once there** (rendering, state, effects, failure,
  a11y, tests) — its own description already excludes performance, styling and
  test strategy, which is exactly the free ground. Also reuse, don't re-derive,
  its `README.md`: ~85 sources graded P/S/T (primary / named practitioner /
  content-farm) plus a measured `client/src` baseline, and a "Not yet read"
  list. A duplicate skill is not merely redundant — every linked skill is tokens
  in every run. `.claude/skills/frontend-ui-architecture/README.md:1`

- **2026-08-09** — `PromptAssembly` has **no diff slot**: `assemblePrompt` folds
  the diff into `user` along with every `## Heading` and `<untrusted>` wrapper,
  so anything doing per-section accounting cannot report a diff size — only
  `user.length` minus the named slots. `prompt-log.ts` calls that row
  `remainder` and deliberately leaves it untokenised, because it is a difference
  of lengths and not a string that exists anywhere. Do not "fix" this by adding a
  `diff` field to the contract: the trace already persists `user`, so a second
  copy would double the largest thing in the document.
  `reviewer-core/src/prompt.ts:186` · `server/src/modules/reviews/prompt-log.ts:70`

- **2026-08-06** — The cost feature is **present and shipped**, despite the
  2026-08-01 entry below saying commit `d45ab0d` removed it. That commit does not
  exist in this repo — `git log` here is two commits (`ea42c2a`, `02e2b6d`), so
  `git show d45ab0d` fails and any archaeology based on it is a dead end. Verified
  live: the column persists (`server/src/db/schema/runs.ts:26`), the executor
  writes it (`run-executor.ts:248`), and all three surfaces render it. Migration
  `0009` does drop `cost_usd` and `0010` re-adds it, so the removal was real but
  is already undone in-tree. Before planning cost work, grep for `costUsd` rather
  than trusting either entry. `server/src/db/migrations/0010_modern_professor_monster.sql:1`

- **2026-08-01** — Per-run LLM cost is already computed end-to-end; the only
  thing ever missing is persistence. Every provider returns `costUsd` on its
  result, and for OpenRouter it is the REAL billed figure — the client asks for
  it with `usage: { include: true }` and reads `usage.cost`, falling back to the
  injected `PriceBook` estimator. `reviewPullRequest` then sums it across
  map-reduce chunks onto `ReviewOutcome.costUsd`. Commit `d45ab0d` removed the
  cost *feature* by dropping that one field at the destructure in
  `run-executor.ts` and deleting the `agent_runs.cost_usd` column, leaving the
  computation intact. So surfacing cost anywhere costs **zero extra model
  calls** — wire up the existing field, never add a pricing lookup or a second
  request. `reviewer-core/src/review/run.ts:216`

## Tool & Library Notes

- **2026-08-09** — The "edit each vendored copy by hand" advice below stopped
  holding: `./scripts/check-shared.sh` now diffs the two `@devdigest/shared`
  trees, and `--fix` rsyncs server → client (`--delete`, so the client copy is a
  mirror and any client-only edit is destroyed, which is the intent). Edit the
  **server** copy, then run `--fix`, then the bare form as the gate. Do not hand-
  edit the client copy or diff the trees manually. `scripts/check-shared.sh:29`

- **2026-08-06** — `DevDigest Design (standalone).html` (repo root, 1.8 MB) is a
  self-unpacking bundle, not markup: line 170 is a JSON manifest of base64+gzip
  assets keyed by UUID, line 178 is the JSON-encoded HTML template, and the
  `<script src>` UUIDs are rewritten to blob URLs at runtime. Reading it directly
  burns the context window for nothing. It is now extracted to
  `design-mocks/` — read `design-mocks/INDEX.md` for the 28 named screen/module
  sources and open `design-mocks/index.html` to view them.
  `design-mocks/INDEX.md:1`

- **2026-08-06** — The two vendored copies of `@devdigest/shared` are
  independent snapshots and have already drifted: the server copy carries
  `id: 'openai' | 'anthropic' | 'openrouter'`, `sessionId`, `CommitFilesPayload`,
  `sync()` and `diffNameOnly()`; the client copy has none of them. There is no
  sync script and nothing fails when you edit only one — the client typechecks
  only the subset it imports — so a contract change means editing **each** copy
  by hand and diffing them afterwards. Use `diff -rq client/src/vendor/shared
  server/src/vendor/shared` for the whole tree, not one file at a time. Adding
  `costUsd: number | null` needed both. Re-measured 2026-08-09: **five** files
  now differ, and the drift is no longer only additive. `contracts/productionize.ts`
  declares `provider: z.enum(['openai','anthropic'])` on the client against
  `z.enum(['openai','anthropic','openrouter'])` on the server — the same Zod
  schema is supposed to drive validation on both sides, so a legitimate
  `openrouter` response is rejected by the client's own parser. When a bug looks
  like "the server sent something the client refuses to accept", diff the trees
  before debugging either side. `server/src/vendor/shared/adapters.ts:48`

## Recurring Errors & Fixes

_None yet._

## Open Questions

_None yet._
