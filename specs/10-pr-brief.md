# PR Brief — what this PR changes, why, how risky, and what to read first

**Status:** draft
**Packages touched:** server, client, `@devdigest/shared`
**Design source:** `design-mocks/src/12-screen_pr_detail.jsx:65-80` (`BriefCard`) and
`design-mocks/src/09-findings.jsx:78-100` (`VerdictBanner`, the card's top row)
**Supersedes:** nothing
**Borders on:**
- `specs/04-intent-layer.md` — shipped. Brief **consumes** `DerivedIntent`; it never re-derives it. The boundary is in *Relationship to the Intent Layer* below and is the most consequential line in this spec.
- `specs/08-blast-radius.md` — shipped (`specs/08-blast-radius.md:3`; the brief supplied to this spec called it "implementation in progress", which no longer holds). Brief consumes `GET /pulls/:id/blast`'s data and adds nothing to it.
- `specs/07-smart-diff.md` — shipped. Brief consumes its file grouping for ordering and as the drop order under budget pressure; it does not change `SmartDiff`.
- `specs/09-project-context.md` — agreed, unbuilt. It is the only future producer of the "relevant specs" input; until it ships that input is empty (R14).

---

## Problem

A reviewer opening PR #482 today gets three cards on the Overview tab — Intent,
Blast radius, and the raw PR description
(`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:19-32`).
Each answers one question well and none of them answers the question the
reviewer actually has: *is this safe, and where do I start?*

The pieces to answer it are all present and unjoined. Intent is derived and
stored (`server/src/modules/reviews/intent-service.ts`). Blast radius is
computed from the persistent index (`server/src/modules/blast/service.ts:20-44`).
Diff stats and file roles are a free projection
(`server/src/modules/smart-diff/service.ts:26-45`). Findings, blockers, score
and `cost_usd` are persisted per run (`server/src/db/schema/runs.ts:21-36`). What
nobody has written is the one sentence that reads all of them and says *"this
touches the auth surface through three public endpoints — read
`src/middleware/ratelimit.ts` first."*

The wire for it is even pre-provisioned and dead: `FEATURE_MODELS` registers
`risk_brief` — "Assesses merge risks for a pull request"
(`server/src/vendor/shared/contracts/platform.ts:60-66`) — with **zero**
consumers anywhere; `client/messages/en/brief.json` ships a full i18n bundle
nobody reads; and `PrBrief` exists as a Zod contract
(`server/src/vendor/shared/contracts/brief.ts:170-176`) with no producer and no
route.

## Goals

- **G1.** A reviewer decides whether to start on a PR, and where, from one card,
  without opening the diff.
- **G2.** Everything the card claims points at something real in this PR — a
  file it changed, or an endpoint its blast radius names (R4).
- **G3.** The card is free to look at. Opening the same PR state twice costs one
  model call, not two (R6).
- **G4.** The cost of the feature is knowable before it is paid: a hard,
  measured input ceiling (R5), and a recorded per-call cost (R10).

## Non-goals

- **N1. The brief never changes a review.** It is not injected into any agent's
  prompt, it never filters, ranks, or suppresses a finding, and it never touches
  a verdict. This is `specs/04-intent-layer.md`'s standing decision, and it binds
  here for the same reason.
- **N2. It is not a second reviewer.** It reads no code. Hunk bodies are excluded
  by construction (R2), so it cannot find a bug and must never claim to.
- **N3. It does not compute `PrHistory`.** "Prior PRs touching these files"
  appears in the mock (`design-mocks/src/12-screen_pr_detail.jsx:53-63`) and in
  the `PrBrief` contract (`contracts/brief.ts:119-132`) with no producer anywhere
  in the repo. It stays unbuilt and out (`specs/08-blast-radius.md:31-34` left it
  the same way).
- **N4. No MCP tool.** `mcp/` has a token budget it must stay under
  (`mcp/AGENTS.md`); adding a brief tool is a separate decision.
- **N5. No automatic generation on push, on import, or on review.** The brief is
  generated when a user asks for it (R1) — it spends money.

## Relationship to the Intent Layer — read this before planning

They are **two calls to two different models about two different questions**, and
they must stay that way.

| | Intent (shipped) | Brief (this spec) |
| --- | --- | --- |
| Question | *why does this PR exist* | *what does it change, how risky, what to read first* |
| Reads | title, branch, body, linked issue, referenced docs, commit subjects, changed paths (`intent-prompt.ts:50-67`) | **the derived intent's output**, plus blast radius, diff stats, file roles, linked issue |
| Reads the diff? | never | never — stats and paths only (R2) |
| Output goes to | the **review prompt** (`reviewer-core/src/prompt.ts:145-155`) | the **reviewer's screen** only (N1) |
| Cache key | signal fingerprint, `head_sha` deliberately excluded (`intent-service.ts:91-105`) | `head_sha` (R6) — see below |

**They do not share an assembly path, and the brief does not re-collect signals.**
The brief takes `DerivedIntent` as a *finished input* with its own
`fingerprint`, `band` and `sources`. Two reasons, and the second is structural:

1. Re-collecting means a second `gh.getIssue`, a second doc read, and a second
   chance for the two to disagree about what the PR claims — a card that
   contradicts the Intent card directly above it is worse than no card.
2. `intent-signals.ts` lives inside `modules/reviews/`, and `pnpm arch`'s
   `no-cross-module-internals` rule (`server/.dependency-cruiser.cjs:68-79`)
   forbids any other module from importing it. So the choice is not "share or
   duplicate" — it is "consume the output, or promote the collector to
   `modules/_shared/`". This spec requires the former (R2) and leaves the latter
   as Q3.

**The one deliberate overlap** is the linked issue: the brief wants the issue
text itself, not intent's one-sentence read of it. It is fetched once per brief
generation and fails closed exactly as intent's does (R14, C7).

## Scope — in / out

**In**

- `POST /pulls/:id/brief` (generate) and `GET /pulls/:id/brief` (read cached).
- One structured model call against the `risk_brief` feature model.
- A pre-flight token gate at 8 000 by `container.tokenizer.count` (R5).
- A code-enforced grounding gate over every risk and review-focus entry (R4).
- A per-PR-state cache and a *Regenerate* control (R6).
- `PrBriefCard` at the top of the PR Overview tab, above `IntentCard`.
- New `Brief` / `BriefRecord` contracts in `@devdigest/shared` and one add-only table.

**Out**

- Everything in **Non-goals**, plus:
- Backfill for existing PRs. A PR with no brief renders the offer to generate one.
- Changing `IntentCard` or `BlastRadiusCard`. The brief sits above them; the mock
  nests them inside it (see *Divergence*), and that regrouping is out.
- The design's *Risk areas* pill row as a second surface. `Risks` (`contracts/brief.ts:100-116`)
  is populated by **this** feature's `risks[]` and rendered inside the brief card;
  it does not also get a standalone card.

## Requirements

| ID | Requirement | Source |
| --- | --- | --- |
| R1 | `POST /pulls/:id/brief` generates and returns a `BriefRecord` for the PR at its current `head_sha`. `GET /pulls/:id/brief` returns `200` with `null` when none exists — "no brief" is a state, not a `404`, matching `GET /pulls/:id/intent` (`server/src/modules/reviews/routes.ts:141-150`). | request 1 · house pattern |
| R2 | The model input is assembled from exactly the rows of **Provenance of inputs** and nothing else. **`pr_files.patch` — the hunk body (`server/src/db/schema/pulls.ts:44`) — is never read on this path.** Only `path`, `additions`, `deletions` and the smart-diff `role` are. | request 1 · N2 |
| R3 | Generation makes **one** structured model call, against the workspace's `risk_brief` feature model (`contracts/platform.ts:60-66`), returning `Brief { what, why, risk_level, risks[], review_focus[] }`. No second call, no repair call, no map-reduce. | request 2 |
| R4 | Every `risks[].file_refs[]` entry and every `review_focus[]` target is checked **in code** against the reference set built from the assembled input: the PR's changed file paths, the files named by `BlastRadius.changed_symbols[].file`, and the endpoint strings in `BlastRadius.downstream[].endpoints_affected[]`. An entry that resolves to none of them is **dropped before persistence**, counted in `dropped_refs`, and logged with the offending string. Nothing unresolvable is ever stored or rendered. | request 3 |
| R5 | Before the call, the assembled input is measured with `container.tokenizer.count` (`server/src/adapters/tokenizer/index.ts:29`) — the repo's single counter (`server/INSIGHTS.md:50-53`). If it exceeds **8 000**, inputs are dropped in the order given in *Provenance of inputs* and re-measured. If it is still over after every droppable input is gone, **the call is not made** and the record is written degraded with `error: 'input_over_budget'`. | settled decision |
| R6 | The brief is cached per **PR state**, defined as `(pr_id, head_sha, intent_fingerprint, repo_last_indexed_sha, prompt_version, provider, model)`. `GET` and a `POST` without `force` return the cached row when every component matches. `POST { force: true }` regenerates. | settled decision |
| R7 | Attacker-controlled text — PR title, PR body, linked issue title and body, commit subjects — is wrapped with `wrapUntrusted` (`reviewer-core/src/prompt.ts:30`) inside the brief's own user message. Instructions, the output schema and the input labels are trusted text and sit **outside** every wrapper. | request · `specs/04-intent-layer.md:155-158` |
| R8 | `PrBriefCard` renders, at the top of the Overview tab above `IntentCard`: the `risk_level` badge, `what` and `why` as prose, the risk pills with their expandable explanation and file refs, and the `review_focus[]` list. | design `12-screen_pr_detail.jsx:65-80` · request 5 |
| R9 | Every `review_focus[]` entry whose target is a changed file is a **clickable** control that navigates to `?tab=diff` anchored on that file, using the same same-page `router.replace` pattern Smart Diff uses for a finding badge (`specs/07-smart-diff.md`, *Where a badge leads*). An entry whose target is an endpoint is rendered as text, not as a dead link. | request 5 |
| R10 | The record persists `provider`, `model`, `prompt_version`, `tokens_in` (the provider's own `usage.input_tokens`), `tokens_out`, `cost_usd`, `budget_tokens` (the pre-flight count from R5), `dropped_inputs[]`, `dropped_refs` and `generated_at`. `POST /pulls/:id/brief` runs outside any agent run, so **no `run_traces` row exists to carry them** (`server/src/modules/reviews/routes.ts:161-163` shows the same standalone shape for intent, where this data is logged and then lost). | settled decision · gap found |
| R11 | `@devdigest/shared` gains `Brief`, `ReviewFocusItem` and `BriefRecord`. `Brief.risk_level` reuses the existing `RiskSeverity` enum (`contracts/brief.ts:101`); `Brief.risks[]` reuses the existing `Risk` shape (`contracts/brief.ts:104-111`). The existing `PrBrief` composite is **left untouched**. | request 2 · contract hygiene |
| R12 | A generation failure — no provider key, timeout, structured-output failure after one retry, over-budget — writes a record with `degraded: true` and a human-readable `error`, and the card renders that plus a *Retry* control. It never returns a `5xx` for a model failure and never renders blank. | `specs/04-intent-layer.md:97-104` |
| R13 | The card's counts row (findings, blockers, score) is computed over **every review at the PR's current `head_sha`, counting a null `head_sha` as current** — never the newest `reviews` row, which is one agent's opinion (root `INSIGHTS.md:164-178`). A PR with no review at head shows "not reviewed yet", not "0 findings". | root `INSIGHTS.md:164-178` |
| R14 | Every input in *Provenance of inputs* has a stated missing-value behaviour and none of them fails the request. A brief generated with a degraded blast radius, a null intent, or no linked issue is a normal, complete brief that says which input was missing. | `specs/04-intent-layer.md:95-104` |
| R15 | `POST /pulls/:id/brief` is rate-limited to **10/min**, matching `/pulls/:id/intent` and `/pulls/:id/review` — it spends money (`server/src/modules/reviews/routes.ts:152-156`). | house pattern |
| R16 | All new user-facing strings are `next-intl` message keys under the **existing** `client/messages/en/brief.json` namespace, which already ships `block.*`, `noRisks`, `unavailable` and `unavailableHint`. A hardcoded literal is a defect. | `client/messages/en/brief.json` · `client/src/i18n/request.ts:9-12` |

## Provenance of inputs

One row per input to the model call. **Budget** columns sum to the 8 000 ceiling
of R5. **Drop order** is the sequence R5 applies under pressure — highest number
goes first.

| # | Input | Source (`path:line` / endpoint) | Trust | If missing | Budget | Drop order |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Instructions + output schema + input labels | written here | **trusted** — outside every wrapper (R7) | n/a | 600 | never |
| 2 | PR title, number, branch → base | `pull_requests.title/number/branch/base` (`server/src/db/schema/pulls.ts:16-20`) | **untrusted** (title) | `title` is `notNull`; cannot be missing | 150 | never |
| 3 | Diff stats: `additions`, `deletions`, `files_count` | `pull_requests` (`schema/pulls.ts:22-24`) | trusted (integers) | defaults are `0`; a `0`-file PR is C1 | 100 | never |
| 4 | Derived intent: `summary`, `category`, `band`, `in_scope[]`, `out_of_scope[]` | `GET /pulls/:id/intent` → `pr_intent` (`server/src/db/schema/reviews.ts:50-75`) | **untrusted** — it is a model's read of attacker text | null or `degraded` → omitted, card says "intent not derived", brief still generated (R14) | 800 | 6 |
| 5 | Blast summary + changed symbols + affected endpoints/crons | `GET /pulls/:id/blast` (`server/src/modules/blast/routes.ts:21-28`) | trusted — derived from the code index, not from user text | degraded index → the summary already says so (`specs/08-blast-radius.md:72-76`); pass it through verbatim | 1 500 | 5 (callers only; the summary line and endpoints are never dropped, because they are R4's reference set) |
| 6 | Changed files: `path`, `+`/`−`, smart-diff `role` | `GET /pulls/:id/smart-diff` (`server/src/modules/smart-diff/routes.ts:23-30`), over `pr_files` (`schema/pulls.ts:36-45`) | trusted (paths) | no `pr_files` rows → C1 | 2 500 | 4 — drop the `boilerplate` group entirely, then `wiring`; `core` is never dropped |
| 7 | PR body | `pull_requests.body` (`schema/pulls.ts:26`) | **untrusted** — wrapped (R7) | null → omitted | 1 000 | 3 — sliced from the tail, as `MAX_PR_DESCRIPTION_CHARS` does (`reviewer-core/src/prompt.ts:36`) |
| 8 | Linked issue: number, title, body | resolved live per call, `resolveLinkedIssue` (`server/src/adapters/github/octokit.ts:91,127`) — **not persisted anywhere** | **untrusted** — wrapped (R7) | no token / 404 / offline → omitted with a note; never throws (C7) | 1 200 | 2 — body first, keep number + title |
| 9 | Commit subjects (≤30, ≤120 chars) | `pr_commits.message` (`schema/pulls.ts:47-56`) | **untrusted** — wrapped (R7) | empty → omitted | 250 | 1b |
| 10 | Attached project-context documents | `specs/09-project-context.md` — **unbuilt**; no producer exists today | **untrusted** — wrapped (R7) | **always missing until spec 09 ships.** The slot is specified and empty (Q2) | 400 | 1a — first to go |

**`pr_files.patch` appears in no row of this table, and that is the point of R2.**

## Design analysis

### States the design covers

`design-mocks/src/12-screen_pr_detail.jsx:135-140` renders `OverviewTab` as one
section labelled "PR Brief" containing `BriefCard` (`:65-80`), which draws:

- `VerdictBanner` (`09-findings.jsx:78-100`): verdict icon + label, a
  `"6 findings · 2 blockers"` badge, a prose summary, a `CircularScore` "PR
  SCORE" ring, and a cost line with `tokens_in→tokens_out`.
- A left card: intent prose, IN SCOPE / OUT OF SCOPE columns (`:3-18`), and the
  risk pill row with per-pill explanation and `MonoLink` file refs (`:23-37`).
- A right card: blast radius, plus a collapsed "Prior PRs touching these files"
  accordion (`:53-63`).

All of it is drawn at exactly one state: populated, three risks, two blockers.

### States it does not

Each row names the mock element it is a gap in.

| Axis | Gap | Requirement |
| --- | --- | --- |
| Emptiness | No brief has ever been generated. `BriefCard` (`12-…:65`) has no not-yet-state; `IntentCard` solved the same problem with an offer to derive (`specs/04-intent-layer.md:187-195`), and `brief.json` already ships `unavailable` + `unavailableHint` for it. | R1, R12 |
| Emptiness | `risks: []` and `review_focus: []` from a genuinely low-risk PR. `RiskPillRow` (`12-…:26`) maps over `window.RISKS` and draws nothing for an empty array; `brief.json` already has `noRisks`. | C2 |
| Cardinality | One risk (pill row looks broken with a single pill) and fifteen risks (`flexWrap` at `12-…:26` grows the card unbounded). | C3 |
| Extremes | A 400-character `what` from the model, and a 180-character file path in `MonoLink` (`12-…:36`) — the mock's longest is 34 chars. | C4 |
| Time | The model call runs 20–45 s. The mock has no in-flight state at all; the button in `PRHeader` (`12-…:129`) is a review trigger, not a brief one. | C5 |
| Failure | Model timeout, no provider key, over-budget. Nothing in the mock draws an error. | R12, C6 |
| Failure | Blast radius degraded — the index is unavailable, which is the seeded demo's permanent state (`server/INSIGHTS.md:129-141`). | R14, C8 |
| Permission | Out of scope: there is one workspace and no per-user permission model in the client today. Recorded so the omission is deliberate, not overlooked. | n/a |
| Concurrency | The author pushes while the reviewer reads. The brief was generated at the old `head_sha`; the mock has no staleness affordance, though the repo has `isStaleRun`/`shortSha` for exactly this (`client/…/staleness.ts:14-25`). | C9 |
| Concurrency | Two *Regenerate* clicks, or two tabs, in flight at once. | C10 |
| Reachability | The card is only reachable from the Overview tab; nothing links **to** a specific review-focus entry, and the back button after a focus click must return to Overview, not to the diff. | R9, C11 |

### Divergence from `client/` today

| Mockup | Today (`path:line`) | Intended change (→ Rn) or mockup oversight (→ Qn) |
| --- | --- | --- |
| Overview = one "PR Brief" section wrapping Intent + Blast in a 2-column grid (`12-…:66-79`) | Overview is three stacked siblings: `IntentCard`, `BlastRadiusCard`, Description (`OverviewTab.tsx:19-32`) | **Mockup oversight to defer.** The brief card is added **above** the existing three; the regrouping is out of scope (*Scope — out*) → Q4 |
| `VerdictBanner` is the brief's top row, showing the PR's verdict, score and cost (`12-…:67`) | `VerdictBanner` exists but is **per-review**, takes an `agentName`, and renders inside `ReviewRunAccordion` on the Findings tab (`_components/VerdictBanner/VerdictBanner.tsx:12-25`, `ReviewRunAccordion.tsx:159`) | **Intended, with a correction.** The brief card carries its own counts row; it must aggregate across every review at head, not reuse one agent's banner (→ R13). Reusing `VerdictBanner` verbatim would show one agent's verdict as the PR's — the exact bug root `INSIGHTS.md:164-178` records |
| Cost line inside the banner, `$0.014 · 8.2K→1.3K` (`09-findings.jsx:97-99`) | `VerdictBanner` renders **no cost at all**; cost lives in `RunCostBadge` on the PR list and the run timeline (`client/INSIGHTS.md:163-175`) | **Intended.** The brief card shows the *brief's own* cost from R10, through `formatCostUsd`, honouring the `null` → `—` vs `0` → `$0.00` rule (`client/INSIGHTS.md:155-162`) → R10 |
| A `REVIEW FOCUS — READ THESE FIRST` list under the card | **Absent from every file in `design-mocks/src/`.** Grepped the 28 sources for `review focus` / `read these first` / `read first`: zero matches | **Mockup oversight — the largest one.** The single most valuable half of the requirement has no drawn design. Layout, ordering and the clicked-state are unspecified → R8, R9, Q1 |
| Risk pills coloured by `kind` → icon (`security`/`db_migration`/`breaking_api`/`perf`/`deps`, `12-…:20`) | `Risk.kind` is `z.string()` — unconstrained (`contracts/brief.ts:105`); no client component renders it | **Intended change with an open edge.** An unknown `kind` from the model would index `RISK_ICON` to `undefined` and throw inside `Icon[…]`, and the client has **zero error boundaries** (`client/INSIGHTS.md:275-287`) → C12, Q5 |
| "Prior PRs touching these files" accordion (`12-…:53-63`) | Nothing; `PrHistory` has a contract and no producer anywhere | **Intended omission** — N3 |
| `PR SCORE` ring at 61 (`09-findings.jsx:96`) | `CircularScore` exists in `@devdigest/ui` and is fed a per-review `score` | **Intended**, aggregated per R13; renders "not reviewed yet" when no review sits at head |

### UX improvements proposed

Each is `proposed`, not required.

- **`proposed` — the review-focus list carries the reason inline, not on hover.**
  "`src/middleware/ratelimit.ts` — every public endpoint's auth bucket runs
  through here" answers *why this first* without a second interaction. The mock's
  risk pills hide the explanation behind a click (`12-…:33`); for a list whose
  entire job is to be acted on in order, that is one click per item before the
  reviewer can even choose.
- **`proposed` — the card states which inputs were missing, in one line.**
  "Generated without the linked issue (GitHub unreachable)." This is the same
  honesty `IntentCard` already applies to its `sources` list
  (`specs/04-intent-layer.md:182-186`), and it is what makes a thin brief
  diagnosable instead of looking like a weak model.
- **`proposed` — *Regenerate* is disabled, with the reason, when the state has not
  changed and the cached row is healthy.** An enabled button that returns the
  identical text reads as broken — the exact failure `specs/04-intent-layer.md:204-206`
  records for *Recalculate* without `force`.

## Module interaction

| From → to | Contract | Sync? | If the far side fails | Requirement |
| --- | --- | --- | --- | --- |
| `client` → `server` `POST /pulls/:id/brief` | `BriefRecord` | sync, ~20–45 s | Request rejected/timed out → TanStack `MutationCache.onError` already toasts it (`client/src/lib/providers.tsx:35-43`); the card returns to its previous state, cached or offer | R12, C6 |
| `client` → `server` `GET /pulls/:id/brief` | `BriefRecord \| null` | sync, fast | Query error → card renders its error branch **before** its empty branch, or a failure reads as "no brief" (`client/INSIGHTS.md:246-260`) | R1, C6 |
| brief module → intent | `DerivedIntent`, via the container — **not** by importing `modules/reviews/*`, which `no-cross-module-internals` forbids (`.dependency-cruiser.cjs:68-79`) | sync, DB read | null / degraded → input 4 omitted, brief proceeds | R14, Q3 |
| brief module → `container.repoIntel` | `BlastRadius` (`contracts/brief.ts:93-98`) | sync, index read | degraded index → the summary says so; pass it through, never substitute zero (`specs/08-blast-radius.md:72-76`) | R14, C8 |
| brief module → `container.tokenizer` | `count(text): number` (`adapters/tokenizer/index.ts:16-18`) | sync, in-process | The adapter cannot throw — it falls back to `ceil(chars/4)` internally (`:30-38`). A brief measured by the heuristic is still gated at 8 000 | R5 |
| brief module → `container.llm(provider)` | `completeStructured` | sync, one call | no key → degraded, logged, no row cost; timeout/schema failure after one retry → degraded row (R12) | R3, R12 |
| brief module → `container.github()` | `resolveLinkedIssue` (`octokit.ts:91,127`) | sync, one call | 404 / no token / offline → input 8 omitted with a note; never throws | C7 |
| brief module → reviews at head | findings, blockers, score, per R13 | sync, DB read | no review at head → "not reviewed yet" | R13 |
| `@devdigest/shared` → both trees | server copy first, then `./scripts/check-shared.sh --fix` (root `INSIGHTS.md:321-326`) | n/a | The two copies have already drifted five files (root `INSIGHTS.md:337-352`) — editing only one silently ships a client that rejects the server's own response | R11 |

## Contract changes

In `server/src/vendor/shared/contracts/brief.ts`, then mirrored with
`./scripts/check-shared.sh --fix`:

- **`ReviewFocusItem`** — `{ kind: 'file' | 'endpoint', ref: string, reason: string, line?: number }`.
  `kind` is what R9 branches on to decide link vs. text; `ref` is what R4
  validates.
- **`Brief`** — `{ what: string, why: string, risk_level: RiskSeverity, risks: Risk[], review_focus: ReviewFocusItem[] }`.
  Reuses the existing `RiskSeverity` (`:101`) and `Risk` (`:104-111`) — no new
  severity vocabulary enters the repo.
- **`BriefRecord`** — `Brief.extend({ pr_id, head_sha, intent_fingerprint, repo_indexed_sha, provider, model, prompt_version, tokens_in, tokens_out, cost_usd, budget_tokens, dropped_inputs, dropped_refs, degraded, error, generated_at })` (R6, R10, R12).
- **Left untouched:** `PrBrief` (`:170-176`). It composes `Intent + BlastRadius + Risks + PrHistory`, has no producer, and its only reference is a type re-export at `client/src/lib/types.ts:35`. Widening or repurposing it would be a breaking change in service of a name → Q6.

**Schema:** one new table, add-only, so a single `pnpm db:generate` pass with no
interactive prompt (`server/INSIGHTS.md:95-102`). It has the shape `repo_map_cache`
already uses for a state-keyed cache (`server/src/db/schema/repo-intel.ts:129-143`).

## Corner cases

| ID | Case | Expected behaviour | Requirement |
| --- | --- | --- | --- |
| C1 | The PR has zero `pr_files` rows — the detail fetch was interrupted mid-delete-and-reinsert (`server/INSIGHTS.md:185-196`) | No call is made. The record is degraded with `error: 'no_changed_files'`, and the card says "This PR's files have not been imported — reload the PR", not "no risks found" | R14 |
| C2 | The model returns `risks: []` and `review_focus: []` for a one-line typo fix | Stored as-is with `risk_level: 'low'`. The card renders `what`/`why` and the existing `brief.noRisks` string. An empty focus list is a valid answer, not a failure | R8 |
| C3 | The model returns 15 risks | The card renders the first 8 by descending severity and a "+7 more" disclosure. `risks[]` is stored whole — the cap is display-only, so the count and the list never contradict (`specs/08-blast-radius.md:67-70`) | R8 |
| C4 | A `review_focus[].ref` is a 180-character path, or `what` is 400 characters | Middle-truncated with a `title` attribute carrying the full string. Never wrapped to five lines, never silently cut with no affordance | R8 |
| C5 | Generation takes 40 s | The button enters a pending state naming the wait ("Reading the diff map…"), and the previously cached brief, if any, stays on screen underneath rather than being replaced by a skeleton | R12 |
| C6 | The provider returns a 500 on the call and on its one retry | Record written with `degraded: true`, `error` = the provider message, `cost_usd: null`. Card renders the error and a *Retry*. The route returns `200` with the degraded record, never a `5xx` | R12 |
| C7 | `resolveLinkedIssue` throws — no `GITHUB_TOKEN`, or the issue is in a private repo | Input 8 is omitted, `dropped_inputs` records `linked_issue:unreachable`, generation proceeds, and the card's missing-inputs line names it | R14 |
| C8 | The repo was never indexed — the seeded demo's permanent state (`server/INSIGHTS.md:129-141`) | Blast's own degraded summary is passed through verbatim. R4's reference set then contains **no** endpoints, so any endpoint the model names is dropped by R4 and counted — which is correct, not a regression | R4, R14 |
| C9 | The author pushes; `head_sha` moves while the reviewer has the card open | The cached brief no longer matches the key (R6). The card keeps rendering it, marked stale with the 7-char sha (`staleness.ts:22-25`) and an offer to regenerate. It is **not** auto-regenerated — that would spend money on a page nobody asked to refresh | R6, R13 |
| C10 | *Regenerate* is clicked twice, or in two tabs | The second request is rejected by the 10/min limiter or serialised server-side; the client disables the control while its own mutation is in flight. Two rows for one state must never exist — the cache key is the primary key | R6, R15 |
| C11 | A review-focus entry points at a file the smart-diff viewer has collapsed inside the `boilerplate` group | The click expands that group and scrolls to the file. Landing on a collapsed section that shows nothing reads as a broken link | R9 |
| C12 | The model returns `risks[0].kind = "concurrency"` — a value no icon map covers | The pill renders with a neutral fallback icon and the raw `kind` as its label. It must not index an icon map to `undefined` and throw: the client has no error boundaries, so a render throw blanks the whole page (`client/INSIGHTS.md:275-287`) | R8 |
| C13 | The model returns `review_focus` entries that all fail R4 | All are dropped, `dropped_refs` equals the returned count, and the record is stored `degraded: true` with `error: 'ungrounded_output'`. A brief whose entire focus list was invented is not a brief | R4 |
| C14 | The assembled input is 9 400 tokens after every droppable input is gone — a 300-file PR | No call. Degraded with `error: 'input_over_budget'`, and the card says the PR is too large to brief and names the file count | R5 |

## Non-functional requirements

| Axis | Bound | Requirement | `n/a` because |
| --- | --- | --- | --- |
| Latency | The card renders its cached or offer state **before** the brief request resolves — it is never gated on the model. `GET /pulls/:id/brief` is two indexed reads and must return under 300 ms warm. Generation is budgeted at **45 s** (`timeoutMs: 45_000`, the value intent already uses at `intent-service.ts:114-142`), which sits far below the adapter's 240 s and the job runner's 300 s, so the race pinned by `server/test/timeout-budget.test.ts:19` cannot reopen | R1, R12 | |
| Scale | Input ceiling **8 000 tokens** by `container.tokenizer.count`, enforced pre-flight (R5). Past it, drop per *Provenance*; past that, refuse and say so (C14). Output capped at `maxTokens: 1200` | R5, C14 | |
| Cost | **Exactly one model call per generation**, and zero per view (R6). At `risk_brief`'s registered default (`openai`/`gpt-4.1`, `contracts/platform.ts:60-66`) an 8 000-token input is roughly an order of magnitude more expensive than `review_intent`'s `claude-haiku-4-5` — and that default predates the pricing work, exactly as `review_intent`'s did (`specs/04-intent-layer.md:210-215`) → Q7. `cost_usd` is already computed end-to-end by every provider adapter, so surfacing it costs no extra call (root `INSIGHTS.md:231-241`) | R3, R6, R10 | |
| Failure | Degraded, never hard, for every dependency: intent, blast, GitHub, the model. The only hard refusals are C1 (no files to describe) and C14 (over budget) — both of which produce a stored record and a rendered explanation, not a `5xx` | R12, R14 | |
| Security | Untrusted: PR title, PR body, linked issue title and body, commit subjects, and the derived intent (itself a read of untrusted text). All wrapped per R7. `INJECTION_GUARD` already names PR title/description and derived intent/scope as data (`reviewer-core/src/prompt.ts:16-27`) but is appended only by `assemblePrompt` — **this call does not go through `assemblePrompt`**, so the brief's own system prompt must carry an equivalent guard or the wrapper is decorative. Note that `intentUserPrompt` (`intent-prompt.ts:50-67`) uses a plain instruction line and **no** `wrapUntrusted` at all; do not copy that shape. Nothing from the model is ever executed, and no secret, token or path outside the repo enters the input | R7 | |
| Accessibility | Every review-focus entry is a real `<button>`/`<a>`, reachable by Tab in list order, with a visible focus ring; the risk pills are `aria-expanded` toggles. The 13 non-link navigations `specs/05-pr-self-review.md:26` records as an existing defect are not to be added to | R8, R9 | |
| i18n | Every new string is a key in the existing `client/messages/en/brief.json` namespace (R16). Counts use the explicit `{count, number}` form — a bare `{count}` is string interpolation and renders `8000`, not `8,000` (`client/INSIGHTS.md:227-235`) | R16 | |
| Observability | R10's fields make a bad brief diagnosable cold: which inputs were dropped, how close to 8 000 it ran, how far `budget_tokens` drifted from the provider's `tokens_in`, and how many entries R4 rejected. Without them this feature has **no trace at all**, because a standalone `POST` has no run (R10) | R10 | |

## Acceptance criteria — EARS

| ID | Criterion | Req | Verify by |
| --- | --- | --- | --- |
| A1 | **When** a reviewer reopens a PR whose `head_sha`, intent fingerprint and repo index sha are unchanged since the last brief, the server **shall** return the cached `BriefRecord` and **shall** make **no** model call. | R6 | server `brief.it.test.ts` — a mock LLM adapter whose call counter must read exactly `1` after two `POST`s |
| A2 | **The** brief service **shall** store and render only risk `file_refs` and `review_focus` entries whose `ref` resolves to a changed file path, a `changed_symbols[].file`, or an `endpoints_affected[]` string present in the assembled input. | R4 | server hermetic `brief-grounding.test.ts` — fixture model output naming `src/does-not-exist.ts`; asserts it is absent from the record and `dropped_refs === 1` |
| A3 | **The** brief service **shall** measure the assembled input with `container.tokenizer.count` and **shall** keep it at or below 8 000 tokens on every call it makes. | R5 | server hermetic `brief-budget.test.ts` — `ContainerOverrides.tokenizer` counting fixture; asserts the string handed to the LLM mock measures ≤ 8 000 |
| A4 | **The** brief service **shall not** include any `pr_files.patch` content in the model input. | R2 | server hermetic `brief-budget.test.ts` — a PR fixture whose `patch` carries a sentinel token; asserts the sentinel is absent from the captured input |
| A5 | **If** the assembled input still exceeds 8 000 tokens after every droppable input has been removed, **then** the server **shall** make no model call and **shall** persist a record with `degraded: true` and `error: 'input_over_budget'`. | R5, C14 | server hermetic test — 300-file fixture; asserts LLM call count `0` |
| A6 | **When** a reviewer clicks a `review_focus` entry of kind `file`, the client **shall** navigate to `?tab=diff` on the same page and scroll that file into view, expanding its group if collapsed. | R9, C11 | `PrBriefCard.test.tsx` (`router.replace` argument) + `SmartDiffViewer.test.tsx` (`scrollIntoView` on the path's DOM id) |
| A7 | **The** `PrBriefCard` **shall** render the `risk_level` badge, `what`, `why`, the risk pills and the review-focus list whenever a non-degraded record exists. | R8 | `PrBriefCard.test.tsx` · `e2e/specs/12-pr-brief.flow.json` |
| A8 | **Where** no brief has been generated for the PR, the `PrBriefCard` **shall** render a one-line explanation and a *Generate brief* control rather than nothing. | R1, R12 | `PrBriefCard.test.tsx` (query resolves `null`) · `e2e/specs/12-pr-brief.flow.json` |
| A9 | **While** the brief request is in flight, the card **shall** keep any previously cached brief visible and **shall** disable the *Regenerate* control. | C5, C10 | `PrBriefCard.test.tsx` (pending mutation state) |
| A10 | **If** the model call fails, times out, or no provider key is configured, **then** `POST /pulls/:id/brief` **shall** return `200` with `degraded: true` and a non-null `error`, and the card **shall** render that error with a *Retry*. | R12, C6 | server `brief.it.test.ts` (throwing LLM mock) · `PrBriefCard.test.tsx` |
| A11 | **If** the derived intent is null or degraded, the blast index is degraded, or the linked issue is unreachable, **then** the server **shall** still return a non-degraded brief and **shall** name the missing input in `dropped_inputs`. | R14, C7, C8 | server `brief.it.test.ts` — three cases, one per input |
| A12 | **The** `PrBriefCard` counts row **shall** be computed from every review at the PR's current `head_sha`, counting a null `head_sha` as current. | R13 | server hermetic test over the same scope helper Smart Diff uses (`smart-diff/repository.ts:findingsAtHead`) · `PrBriefCard.test.tsx` with a two-agent fixture where the newest review is empty |
| A13 | **The** persisted `BriefRecord` **shall** carry `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, `budget_tokens`, `dropped_inputs` and `dropped_refs` for every generation attempt, including a degraded one. | R10 · R11 | server `brief.it.test.ts` — asserts each column non-null on both the success and the failure path (`cost_usd` excepted) |
| A14 | **When** the PR's `head_sha` moves after a brief was generated, the card **shall** mark the brief stale with the 7-character sha it was generated against and **shall not** regenerate automatically. | R6, C9 | `PrBriefCard.test.tsx` (`shortSha`) — asserts no mutation fires on rerender |
| A15 | **The** brief's model input **shall** enclose the PR title, PR body, linked issue and commit subjects in `<untrusted>` blocks, and **shall** place the instructions and output schema outside them. | R7 | server hermetic `brief-prompt.test.ts` — asserts each untrusted field appears only between the delimiters, and that a body containing `</untrusted>` is escaped (`reviewer-core/src/prompt.ts:31`) |
| A16 | **The** client **shall** render no hardcoded user-facing string in `PrBriefCard`; every string **shall** resolve through the `brief` message namespace. | R16 | `PrBriefCard.test.tsx` rendered under `NextIntlClientProvider`; a missing key throws |
| A17 | **Where** a `risks[].kind` value has no icon mapping, the card **shall** render a fallback icon and the raw value, and **shall not** throw. | C12 | `PrBriefCard.test.tsx` with `kind: "concurrency"` |
| A18 | **The** `POST /pulls/:id/brief` route **shall** reject the 11th request in a minute with `429`. | R15 | server `brief.it.test.ts` |

## Stretch — Why Timeline (cuttable in full)

**A planner may drop this whole section without touching R1–R16.** Nothing above
depends on it.

`WhyEvent` / `WhyTimeline` (`server/src/vendor/shared/contracts/why.ts:15-39`)
are an **unpopulated wire**, confirmed: exported from the barrel
(`server/src/vendor/shared/index.ts:23`) and mirrored into `client/src/vendor/shared/`,
but no `GET /pulls/:id/why` route exists (`server/src/modules/pulls/routes.ts:9-56`
enumerates four routes and none is it), no client component imports
`WhyTimeline`, no table stores one, and `git log -S'WhyTimeline'` returns the
single initial commit `02e2b6d`. The `w` drawer its own doc comment describes
(`why.ts:9`) is not registered either — the client's only shortcuts are `Cmd/Ctrl+K`,
`?` and `g`-then-key (`client/src/components/app-shell/hooks/useGlobalShortcuts.ts:15-56`).
The i18n keys, however, already ship: `client/messages/en/brief.json` carries
`why.title`, `why.blame`, `why.noHistory`, `why.noCommits`.

So the stretch is **connecting an existing wire**, not designing one.

| ID | Requirement | Source |
| --- | --- | --- |
| S1 | Each `BriefRecord` is retained per PR state rather than overwritten, so a PR accumulates one brief per `head_sha` it was generated at. The R6 cache key is already the primary key that makes this true; S1 is the decision **not** to delete the superseded row. | request |
| S2 | A history view on the PR renders those records newest-first with their `head_sha`, `generated_at` and `risk_level`, so a reviewer can see how the stated purpose and the risk level moved across pushes. | request |
| S3 | `WhyEvent` / `WhyTimeline` are **not** reused for S2. They describe a *line's* commit history (`why.ts:31-32`: `file`, `line`, `blame`), which is a different question from a *PR's* brief history. Either a distinct contract is added, or `why.ts` is implemented as its own feature — S3 is the decision that S2 must not bend `WhyTimeline` into a shape its own doc comment contradicts. | contract reading |

| ID | Criterion | Req | Verify by |
| --- | --- | --- | --- |
| AS1 | **When** a brief is generated at a `head_sha` that already has one, the server **shall** replace only that state's row and **shall** leave rows for other `head_sha` values intact. | S1 | server `brief.it.test.ts` — two heads, assert two rows |
| AS2 | **The** history view **shall** list one entry per retained brief, newest first, each naming its 7-character `head_sha`. | S2 | `PrBriefHistory.test.tsx` |
| AS3 | **The** `WhyTimeline` contract **shall** remain unreferenced by this feature. | S3 | `grep -rn WhyTimeline server/src/modules client/src/app` returns nothing |

## Traps

- **`pr_files.patch` is one field away from every input the brief legitimately
  wants** (`server/src/db/schema/pulls.ts:36-45`), and `GET /pulls/:id` returns it
  on `PrDetail.files[].patch` (`server/src/modules/pulls/helpers.ts:137-142`).
  Reading the PR detail as a convenience and passing `files` straight through
  violates R2 silently — A4's sentinel test is what catches it.
- **`pnpm arch`'s `no-cross-module-internals`** (`.dependency-cruiser.cjs:68-79`)
  blocks a `modules/brief/` from importing `modules/reviews/`,
  `modules/blast/` or `modules/smart-diff/`. Share through the container,
  `@devdigest/shared`, or `modules/_shared/` — the precedent is
  `resolveFeatureModel`'s move (`server/INSIGHTS.md:152-159`).
- **The tokenizer adapter's doc comment says "in-process, ONLY under
  modules/repo-intel"** (`server/src/adapters/tokenizer/index.ts:11`). R5 widens
  that scope deliberately; the comment must move with it, or the next reader
  treats the brief's use as a violation.
- **`INJECTION_GUARD` is appended by `assemblePrompt`, not by `wrapUntrusted`**
  (`reviewer-core/src/prompt.ts:127`). A call that does not go through
  `assemblePrompt` gets wrappers with no instruction telling the model what they
  mean.
- **`check-shared.sh --fix` rsyncs server → client with `--delete`.** Edit the
  server copy; a client-only edit is destroyed (root `INSIGHTS.md:321-326`).
- **The seeded demo repo cannot exercise `repo-intel`** (`server/INSIGHTS.md:129-141`),
  so every local run will produce a degraded blast input (C8). A green suite says
  nothing about the indexed path — verify against a real imported, indexed repo.
- **Verify the branch alone on top of `main`.** A feature can look complete and be
  inert because its route registration, hook export, message keys and arch rule
  landed in someone else's commit (root `INSIGHTS.md:369-382`).
- **`client/` has no ESLint** (`client/INSIGHTS.md:216-225`) — no lint gate will
  catch a hook-order or dependency mistake in the new card.

## Amendments

Recorded after the plan's cross-model review
(`plans/10-pr-brief.cross-model-review.md`); A-3 was added later, after the
first real generation was measured. All three were authorised by the CTO — A-1
and A-2 on 2026-08-18, A-3 on 2026-08-26. They are recorded here rather than in
a superseding spec because each changes one clause, and a 400-line rewrite for
three clauses would bury the change it is meant to publish. Nothing else in this
document is edited.

### A-1 (2026-08-18) — R3: `maxRetries` is `0`, not `1`

R3 says "one structured model call. No second call, no repair call." The plan
proposed satisfying it by counting *invocations* while leaving the adapter's
`maxRetries: 1` in place. An adapter retry is a second billed request, so the
worst case per generation would be **2 x 8 000** input tokens against a budget
this spec states as an acceptance criterion.

**R3 now reads:** exactly one `completeStructured` invocation with
`maxRetries: 0`. A malformed structured response is a degradation on the
`ungrounded_output` path, not a retry. The 8 000-token ceiling is therefore
per generation, not per attempt.

### A-2 (2026-08-18) — R6: the Retry button sends `force=true`

The plan proposed regenerating on `POST` when the cached row is degraded, even
at a matching key. That silently changes R6's contract, which says a matching
key returns the cached row.

**R6 is unchanged.** The regeneration path is the existing `force` flag: the
Retry control on a degraded card sends `force=true`, which R6 already permits.
A degraded row stays cached and stays visible until a human asks for another
attempt — which is also the behaviour that keeps a failing provider from being
retried on every page view.

### A-3 (2026-08-26) — R5: the ceiling is **billed** tokens, and the unit is named

R5 as written gated on `container.tokenizer.count(system + user)`. Measured on
the first real generation (PR #482, 2026-08-19): the gate read **612** tokens
and Anthropic billed **2 006** — a 228 % undercount. Two causes, only one of
them fixable in-process:

1. **The structured-output schema is not in `system` or `user`.** It is sent as
   a forced tool's `input_schema` (Anthropic) or `response_format.json_schema`
   (OpenAI), so no counter over the two prompt strings can see it. `Brief`
   serializes to 1 950 characters — **456** `cl100k_base` tokens today.
2. **The provider does not tokenize with `cl100k_base`,** and wraps the request
   in framing of its own. What that costs is not knowable in-process, and one
   real measurement is not enough to model it as anything finer than a ratio.

Nothing was over budget — 2 006 sits well under 8 000 — but the gate was
**unsound**: an input measuring 7 900 would have been billed ~9 300 and passed.
A ceiling that can be crossed without tripping is not a ceiling. The gpt-5
cross-model review predicted exactly this (`cross-model-review.md`, risk 2).

**R5 now reads:** the unit of the 8 000 ceiling is **billed provider input
tokens for the single generation call**. Before the call, that number is
estimated as

```
ceil(tokenizer.count(system + user + serialized response schema) × 2)
```

where the serialized schema is produced by the same `toJsonSchema` the adapters
use, from the same `BriefSchema` under the same `schemaName`, so a schema edit
moves the counted envelope in the commit that moves the billed one. The `× 2`
factor rounds the one measurement we have (2 006 ÷ 1 068 ≈ 1.88) **up**, so the
estimate over-states rather than under-states. Drop order, the refusal in C14
and the `error: 'input_over_budget'` record are unchanged; what changes is the
number they are compared against. `budget_tokens` (R10) persists this estimate,
which makes the residual drift auditable per generation against the provider's
own `tokens_in`.

The factor is calibrated on a single generation. **Widen it, never narrow it,**
unless a later measurement across several PRs says otherwise.

**A3 and A5 (acceptance) now read** "estimated billed input" wherever they said
"assembled input measured with `container.tokenizer.count`". The ceiling stays
8 000.

## Open questions

| ID | Question | My proposed default | Blocks |
| --- | --- | --- | --- |
| Q1 | The `REVIEW FOCUS — READ THESE FIRST` list appears in no design mock. How is it laid out, how many entries, and what does a visited entry look like? | An ordered list of **at most 5** entries directly under the prose, each one line: mono path, an em-dash, the reason. Ordering is the model's, preserved. No visited state in v1. | R8, R9 |
| Q2 | Input 10 (project-context documents) has no producer until `specs/09-project-context.md` ships. Ship the brief with the slot empty, or wait? | Ship with the slot specified and empty. The brief is useful without it, and `09` fills it with no contract change. | R14 |
| Q3 | Should `intent-signals.ts` be promoted from `modules/reviews/` to `modules/_shared/` so the brief can reuse the linked-issue resolution instead of calling `resolveLinkedIssue` itself? | No, not in this spec. The brief needs the issue *text*, intent needs a *fingerprint* of it; one shared collector serving both is a refactor of a shipped feature and belongs in its own spec. | Q3 → nothing |
| Q4 | The mock nests Intent and Blast **inside** the brief card as a 2-column grid. Regroup the Overview tab, or stack the new card above the existing three? | Stack above. Regrouping rewrites two shipped, tested cards for a layout change, and the brief has to prove itself first. | R8 |
| Q5 | `Risk.kind` is `z.string()` (`contracts/brief.ts:105`). Narrow it to the mock's five values (`security`, `db_migration`, `breaking_api`, `perf`, `deps`)? | Keep it open, render unknowns with a fallback (C12). Narrowing means a model returning a sixth honest category has its whole risk rejected by response serialization. | C12 |
| Q6 | The unused `PrBrief` composite (`contracts/brief.ts:170-176`) now has a same-named neighbour with a different shape. Delete it, or leave it? | Leave it. Its only reference is `client/src/lib/types.ts:35`, and deleting a contract is not this feature's business; revisit when `PrHistory` is built or abandoned. | R11 |
| Q7 | `risk_brief` defaults to `openai`/`gpt-4.1` (`contracts/platform.ts:60-66`), which predates the pricing work — the same staleness `specs/04-intent-layer.md:210-215` fixed for `review_intent`. Change the default? | Yes — to `anthropic`/`claude-haiku-4-5`, matching `review_intent`'s reasoning, and update **both** mirrors including the hand-maintained `client/src/lib/feature-models.ts:31`, which `check-shared.sh` does not cover. | R3 |
| Q8 | Should the R6 cache key include `repo_last_indexed_sha` (`server/src/db/schema/repo-intel.ts:39`)? A re-index changes the blast input without changing the PR. | Yes, include it. A brief whose blast radius is a re-index out of date is wrong in exactly the way the reviewer cannot see. The cost is one extra regeneration per re-index. | R6 |

## Could not establish

- **The `REVIEW FOCUS` list, the brief's prose card and the `PR SCORE`/cost line
  as one card were described to me in prose, not in pixels.** I grepped all 28
  files in `design-mocks/src/` for `review focus`, `read these first` and
  `read first`: zero matches. What the mock actually draws is
  `VerdictBanner` + Intent + Risks + Blast + History (`12-screen_pr_detail.jsx:65-80`).
  So the divergence table and Q1 are grounded in what exists; the layout of the
  most valuable half of the feature is not designed anywhere I can cite.
- **Whether `container.tokenizer.count` is the *right* proxy for the provider's
  own count.** It is `cl100k_base` (`adapters/tokenizer/index.ts:32`), which is
  OpenAI's encoding — against an Anthropic model (Q7's proposal) the drift
  recorded by R10 will be systematic, not noise. The gate is still the unit of
  record by settled decision; I could not measure the drift without making real
  calls.
- **Real-world input size.** I could not measure what a typical PR's assembled
  input actually costs in tokens, because the seeded demo repo is never indexed
  (`server/INSIGHTS.md:129-141`) so the blast input is empty locally. The per-input
  budgets in *Provenance of inputs* are therefore an allocation of the 8 000
  ceiling, not an observation — the first real run should re-check them, and C14's
  refusal path may be commoner or rarer than assumed.
- **Whether any brief-like assembly exists outside the four modules I checked.**
  `Risks` and `PrHistory` (`contracts/brief.ts:100-132`) have no producer in
  `blast`, `smart-diff`, `pulls` or `reviews`; `reviewer-core` and the CI runner
  path were not searched exhaustively for one.
