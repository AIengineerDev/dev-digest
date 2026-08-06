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

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

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
  by hand and diffing them afterwards (`diff server/src/vendor/shared/adapters.ts
  client/src/vendor/shared/adapters.ts`). Adding `costUsd: number | null` needed
  both. `server/src/vendor/shared/adapters.ts:48`

## Recurring Errors & Fixes

_None yet._

## Open Questions

_None yet._
