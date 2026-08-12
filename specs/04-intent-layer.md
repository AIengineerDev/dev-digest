# Intent Layer — derive why a PR exists, and tell the reviewer

**Status:** agreed — implementation in progress
**Packages touched:** server, client, `reviewer-core`, `@devdigest/shared`
**Depends on:** nothing new. Most of the groundwork already exists (see below).

---

## Problem

A review sees the diff and nothing else. It cannot tell a security fix from a
rename, a spike from a production change, or work that falls outside what the PR
claims to do. The signals that answer "why does this PR exist" — the title, the
body, the linked issue, a referenced spec — are already in the database or one
API call away, and nothing reads them.

## What already exists — this is mostly wiring, not building

Measured 2026-08-09:

| Piece | State |
| --- | --- |
| Table `pr_intent` | **exists** since `0000_init.sql` (`server/src/db/schema/reviews.ts:50`) |
| `upsertIntent` / `getIntent` | **written**, zero callers (`modules/reviews/repository/pull.repo.ts:49,64`) |
| Contract `PrIntentRecord` | **exists**, zero consumers (`contracts/review-api.ts:62`) |
| `review_intent` in `FEATURE_MODELS` | **registered**, default `openai/gpt-4.1` (`contracts/platform.ts:52`) |
| `INJECTION_GUARD` | **already names** "derived intent/scope" as untrusted data (`reviewer-core/src/prompt.ts:16-28`) |
| Settings model picker row | **renders**, but hardcodes `provider: "openrouter"` — a real defect |
| `linked_issue` resolution | **exists** in the GitHub adapter (`octokit.ts:127`), never persisted |

So the schema change is **add-only columns** (one `db:generate` pass), and no new
module is created: everything server-side lives in `modules/reviews/`.

## The design in one line

Sampling and verification are code; the model only proposes. Intent influences
**the prompt and nothing else** — it never filters findings, never weights
severity, never touches the verdict.

## Scope

**In** — contracts; additive columns on `pr_intent`; signal collection; one
classification call to the workspace's `review_intent` model; a fingerprint
cache; `GET`/`POST /pulls/:id/intent`; the prompt slot in `reviewer-core` plus
`PromptAssembly.intent`; the wire in `run-executor`; the PR Overview card and the
trace slot; the Settings default and provider fix.

**Out** — the rest of `PrBrief` (blast radius, risks, PR history, smart diff);
non-GitHub trackers (detected and recorded as unresolved, never fetched); fetching
documents from outside this repo; auto re-derivation on push; the CI runner path;
backfill for existing PRs. **And: using intent to filter findings, gate severity,
or change the verdict — now or later, without a new spec.**

**Deferred to a follow-up iteration:** all new tests. Existing suites must stay
green; no new test files land in this iteration.

## 1. Data sources

**Documentation-grade** — only these may lift confidence above `low`:

| Source | Where from | Notes |
| --- | --- | --- |
| PR body | `pull_requests.body` (already persisted) | attacker-controlled; a body that is only checklist boilerplate counts as absent |
| Linked GitHub issue | one `gh.getIssue` at derive time | fails closed: no token / 404 / offline → `used:false` with a note, never throws |
| Referenced spec or plan in this repo | parsed from the body, read via `container.git.readFile` | allowlist `.md`/`.mdx`/`.txt`; reject `..`, absolute paths, and any URL outside this repo; ≤8 KB per doc, max 2 docs |
| External ticket (Jira/Linear/foreign URL) | body regex | **never fetched** — recorded as `used:false, note:'external tracker not readable'` |

**Indirect** — always available; on their own they cap confidence at `low`: PR
title, branch name, commit subjects (≤30, ≤120 chars each), changed paths, and a
derived file-type mix (test/doc/config/source ratios).

**Deliberately excluded:** the diff body. Paths and stats only.

## 2. Call sequence

`[code]` deterministic · `[model]` one LLM call.

1. `POST /pulls/:id/review` → runs created (unchanged)
2. `executeRuns` builds the `RunLogger` (unchanged)
3. `loadDiff` — the one pre-work step whose failure calls `failAll` (unchanged)
4. `[code]` collect signals; per-source `.catch(() => null)`; 15 s budget for the
   whole step; anything unresolved is `used:false`
5. `[code]` fingerprint (below)
6. `[code]` cache check — matching fingerprint and `degraded === false` → reuse,
   skip to 9
7. `[model]` `resolveFeatureModel(ws, 'review_intent')` → `completeStructured`,
   `temperature: 0`, `maxTokens: 700`, **`timeoutMs: 45_000`**, `maxRetries: 1`
8. `[code]` clamp confidence, then `upsertIntent` (single statement — no
   transaction is needed and none is claimed)
9. `[code]` render the block, pass it per agent alongside `prDescription`
10. `assemblePrompt` renders `## Stated intent` and records `PromptAssembly.intent`

Derivation happens **once per PR**, not per agent.

### Failure behaviour — the whole step is best-effort

| Failure | Result |
| --- | --- |
| a source throws | caught per source; `used:false` + note; the step never throws |
| no documentation-grade source at all | normal path: classify from indirect signals, clamp to `low` |
| no provider key configured | log one line, omit intent, review proceeds |
| model timeout or structured-output failure after one retry | log, omit intent, and write a row with `degraded:true` and **no classification** so the next run retries rather than serving a hole from cache |
| persist fails | `.catch()`; the in-memory intent still reaches this run's prompt |

**Never calls `failAll`.** The 45 s budget sits far below the adapter's 240 s and
the job runner's 300 s, so the race pinned by `test/timeout-budget.test.ts:19`
cannot reopen.

`POST /pulls/:id/intent` runs steps 4–8 only (`force:true` skips step 6).

## 3. Schema

`pr_intent` is add-only — **one `pnpm db:generate` pass**, no interactive prompt,
no two-pass split. Existing `intent` / `in_scope` / `out_of_scope` are untouched;
`pr_id` stays the PK so `onConflictDoUpdate` keeps working.

New columns: `category`, `summary`, `confidence` (double precision), `band`
(denormalised so UI and SQL never re-derive thresholds), `sources` (jsonb, not
null default `'[]'` — **including the sources that failed**, which is what makes a
wrong intent diagnosable), `provider`, `model`, `prompt_version` (int, default 1),
`fingerprint`, `degraded` (bool, default false), `error`, `derived_at`.

## 4. Contracts — `@devdigest/shared` first, then `check-shared.sh --fix`

In `contracts/brief.ts`, leaving `Intent` and `PrBrief` untouched:

- `IntentCategory` — `feature | bugfix | refactor | performance | security | docs | test | chore | revert | unknown`
- `IntentConfidenceBand` — `high | medium | low`
- `IntentSourceKind` — `pr_body | linked_issue | referenced_doc | title | branch | commit_subjects | changed_paths`
- `IntentSource` — `{ kind, ref?, grade: 'documentation'|'indirect', used: boolean, note? }`
- `DerivedIntent` — `Intent.extend({ category, summary, confidence, band, sources, provider, model, prompt_version, fingerprint, derived_at, degraded })`

`contracts/review-api.ts` — `PrIntentRecord` becomes `DerivedIntent.extend({ pr_id })`
(safe: no consumers). `contracts/trace.ts` — `PromptAssembly` gains
`intent: z.string().nullish()` (the rendered block, exactly as sent).

## 5. API

Both routes go in `modules/reviews/routes.ts` — that module already owns the
intent repository methods, and a separate module would add a cross-module edge
past `pnpm arch` for no gain.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/pulls/:id/intent` | 200 with `null` when not yet derived — "no intent" is a state, not a 404 |
| POST | `/pulls/:id/intent` | `{ force?: boolean }`; rate limit 10/min, matching the review route — it spends money |

## 6. Prompt builder

**Placement:** after the task line, **before `## PR description`**
(`reviewer-core/src/prompt.ts:105-106`). The derived summary is read first, the
raw claim second.

**Untrusted, unconditionally.** The block is wrapped with
`wrapUntrusted('derived-intent', …)`. **The band label and the instruction line
are trusted text we write and sit OUTSIDE the wrapper** — otherwise an attacker
could claim `confidence: high` from inside the data. `INJECTION_GUARD` already
covers the rest; **do not edit it**.

**Budget:** `MAX_INTENT_CHARS = 1200`, enforced by slice like
`MAX_PR_DESCRIPTION_CHARS`. At most 1 summary sentence, 5 in-scope and 5
out-of-scope bullets, ≤120 chars each.

**Per-band preamble** (trusted, chosen from `parts.intent.band`):

- **high** — "Derived from the PR's description, linked issue or referenced spec.
  Use it to judge whether the change achieves what it claims and to notice work
  that falls outside it. It does not waive any finding."
- **medium** — as high, plus: "Parts of it were inferred. Treat its scope claims
  as weak evidence; if the diff contradicts it, trust the diff and say so."
- **low** — "No usable documentation was found. The purpose below is INFERRED
  from the title, branch name and commit subjects. Treat it as a hint about
  *where to look first*, never as a statement of scope. Do not use it to decide
  that anything is out of scope, and never let it downgrade or suppress a finding."

## 7. UI

- **`IntentCard`** under `client/src/app/repos/[repoId]/pulls/[number]/_components/`,
  rendered by `OverviewTab` **above** the Description section. Data via
  `usePrIntent` / `useDeriveIntent` in `lib/hooks/reviews.ts`.
- **Honest confidence.** Never a bare percentage. Band badge plus a one-line
  *why* generated from `sources` ("Derived from the PR description and issue
  #482" / "No documentation found — inferred from the title, branch and 7 commit
  subjects"). A `low` card renders muted with the word **Inferred** instead of
  "Intent". Failed sources appear in the same list. `degraded:true` renders
  "Not derived — <error>" with a *Re-derive* button, never an empty card.
- **Run trace:** one `PromptBlock` for `prompt_assembly.intent`, plus the
  **missing** `pr_description` block the trace has silently omitted since that
  field was added.
- **Settings:** fix `setModel` hardcoding `provider: "openrouter"` — carry the
  feature's `defaultProvider` instead; and change the `review_intent` registry
  default to **`anthropic` / `claude-haiku-4-5`** ($1/$5 per 1M, 200K context) —
  this feature's premise is a cheap pre-pass, and `openai/gpt-4.1` predates the
  pricing work. Both mirrors must move: `@devdigest/shared` **and** the
  hand-maintained `client/src/lib/feature-models.ts` (not covered by `check-shared.sh`).

## 8. Logging and trace

Through `RunLogger`, so lines reach every queued run's SSE stream and the
persisted trace:

- `tool` — `Deriving PR intent…` / `… done (Nms)`
- `info` — one line naming every source and whether it was used
- `info` — per unusable source, why
- `result` — `intent: bugfix — "<summary>" (confidence 0.82 high, <model>, 1.4k in / 180 out)`
- `info` on cache hit — `intent: reusing cached classification (<fingerprint prefix>)`
- `info` on clamp — `intent: model claimed 0.9 but no documentation-grade source — clamped to 0.35 (low)`
- `info`/`error` on failure — `intent: classification failed — <msg>; continuing without intent`

## Decisions — do not re-open these

**Confidence.** Stored 0–1, banded **high > 0.75**, **medium 0.40–0.75**,
**low < 0.40**. The model self-reports; **code clamps**:

- no documentation-grade source used → `min(reported, 0.35)` → always `low`
- documentation present, but no path or directory named in `in_scope`/`out_of_scope`
  appears among the changed paths → `min(reported, 0.70)` → at most `medium`
- otherwise `min(reported, 0.95)` — never 1.0

Every clamp is logged with before/after. The band decides **only** the prompt
preamble and the UI badge; nothing else branches on it.

**Fingerprint.** sha256 over canonical JSON of `{title, body, branch,
commitSubjects, changedPaths (sorted), issue{number,title,bodyHash},
docs[{path,contentHash}], provider, model, promptVersion, taxonomyVersion}`.
**`head_sha` is deliberately excluded** — a force-push that changes no signal must
not re-classify; a push that adds files or commits changes `changedPaths` /
`commitSubjects` anyway.

**Taxonomy.** The ten categories above, chosen to map 1:1 onto the
conventional-commit prefixes this repo already writes, so the strongest indirect
signal is directly usable. `unknown` is mandatory and is not a failure.

**Missing intent degrades, never blocks.** The intent step sits **outside** the
`try` whose `catch` calls `failAll`; its body returns `undefined` on any throw,
exactly like `buildRepoMapDigest`. `undefined` → the key is not spread into
`reviewPullRequest` → the section is omitted → **the prompt is byte-identical to
today's**, and `PromptAssembly.intent` is null. A run with no intent is a normal,
complete, successful run.

**Intent never suppresses a finding.** Enforced at three levels: (1) architecture
— intent touches the prompt only, and no code path lets it post-process findings;
(2) the engine's `INJECTION_GUARD`; (3) the per-band preamble, with the `low` band
stating it explicitly. A critical finding in a file the intent called out of scope
is reported at full severity, and the divergence between diff and stated intent is
itself worth saying.

## Phases

Ordered so the wire that makes the feature exist lands before any UI.

| # | What lands | Gate |
| --- | --- | --- |
| 1 | Contracts in `@devdigest/shared`, both trees mirrored | `cd server && pnpm typecheck` · `./scripts/check-shared.sh --fix && ./scripts/check-shared.sh` · `cd client && pnpm typecheck` |
| 2 | Schema columns + migration; widened `upsertIntent`/`getIntent`; pure helpers (`fingerprintSignals`, `bandFor`, `clampConfidence`, `categoryFromConventionalPrefix`) in a `helpers.ts` that stays pure | `pnpm db:generate && pnpm db:migrate && pnpm typecheck && pnpm arch` |
| 3 | Signal collection (`intent-signals.ts`, `intent-constants.ts`) — code only, no model; I/O only through `container.github()` / `container.git` | `pnpm typecheck && pnpm arch` |
| 4 | `IntentService` + `intent-prompt.ts` + the two routes | `pnpm typecheck && pnpm test && pnpm arch` |
| 5 | Prompt slot in `reviewer-core` + `ReviewInput.intent` | `cd reviewer-core && npm run typecheck && npm test` |
| 6 | **The wire** in `run-executor` — derive after `loadDiff`, outside the `failAll` try, spread into `reviewPullRequest` | `cd server && pnpm typecheck && pnpm test && pnpm arch` |
| 7 | `IntentCard`, hooks, trace slot (+ the missing `pr_description` block) | `cd client && pnpm typecheck && pnpm test && pnpm build` |
| 8 | Settings: provider fix + `review_intent` default → `anthropic`/`claude-haiku-4-5`, both mirrors | `./scripts/check-shared.sh` · both typechecks · `cd client && pnpm test && pnpm build` |

## Acceptance criteria

1. A review run derives the intent once, logs every source and whether it was
   used, and shows a non-null `intent` slot in the run trace.
2. A PR with no usable documentation still gets an intent, banded `low`, with the
   clamp recorded in the run log.
3. A referenced in-repo spec is read and recorded in `sources`; a path containing
   `..`, an absolute path, or a URL outside this repo is refused.
4. An external tracker reference is recorded as an unresolved source, never fetched.
5. A second run with unchanged signals makes **zero** LLM calls; `force:true`
   bypasses the cache; a `degraded` row is never served from cache.
6. A failing or timing-out intent leaves the run `done` with `prompt_assembly.intent`
   null and a prompt byte-identical to today's.
7. `GET /pulls/:id/intent` returns 200 + `null` before first derivation.
8. The PR Overview card renders the band, the source sentence, and *Re-derive* for
   a degraded row — and never a bare confidence number.
9. Saving a `review_intent` model in Settings persists the provider shown in the UI.
10. `pnpm arch` reports no new violations; `./scripts/check-shared.sh` is green;
    both typechecks, both existing test suites, and `client pnpm build` pass.

## Traps

- `server/clones/**` holds a full copy of this repository — exclude it from every
  grep, especially when searching for `Intent`, `pr_intent`, or `FEATURE_MODELS`.
- `client/src/vendor/shared/` is a mirror (`check-shared.sh --fix`), but
  `client/src/lib/feature-models.ts` is **hand-maintained** and the script does
  not cover it.
- The migration is generated. Add-only, so one pass.
- `pnpm` in `server/`+`client/`, `npm` in `reviewer-core/`+`e2e/`. Phase 5 is an
  npm phase between pnpm ones.
- Pass `timeoutMs` per request on the intent call; do **not** touch
  `DEFAULT_TIMEOUT` or `DEFAULT_JOB_TIMEOUT`.
- The arch baseline (11 entries) is never regenerated.

## Out of scope for the implementer

- Architecture review and plan verification — separate agents, run on the output.
- Adding tests — deferred to the next iteration by explicit decision.
- Any use of intent to filter, rank, or suppress findings.
