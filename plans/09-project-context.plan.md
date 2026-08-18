# Project Context — Development Plan

**Spec:** `specs/09-project-context.md` (agreed, CTO 2026-08-18)
**Execution mode:** parallel tracks — recommended, see *Execution mode* below; single-implementer fallback is spelled out at the end

## Goal / Done when

An agent whose repo contains `docs/prd.md` can have that document attached on `/repos/:repoId/context`, and its next review's user message contains `## Project context` with the document's text, attributed by path and token count in the Run Trace — where today the `specs` slot exists end-to-end and is never populated.

## Requirement audit

Grounding first: **the spec's central finding holds.** Verified independently —

- `reviewer-core/src/prompt.ts:135-137` builds `specsBlock` from `parts.specs`, `:164` pushes `## Project context`, `:183` writes it to `PromptAssembly.specs`.
- `server/src/vendor/shared/contracts/trace.ts:42` has `specs: z.string().nullish()`; `:110` has `specs_read: z.array(z.string())`.
- `server/src/modules/reviews/prompt-log.ts:51` — `specs: 'project context specs (untrusted)'`.
- `run-executor.ts:254-283` passes `skills`, `callers`, `repoMap`, `prDescription`, `intent`, `task` — **no `specs`**. `specs_read: []` at `:382` and `:614`.
- `specs` appears **nowhere** outside `reviewer-core` (`prompt.ts`, `review/run.ts:61,139`). `reviewPullRequest` has exactly one caller: `run-executor.ts:254`.
- `.md` is not in `SUPPORTED_EXT` (`repo-intel/constants.ts:14`, six JS/TS extensions) and `pipeline/walk.ts:100-101` `continue`s on unsupported extensions. Discovery is a filesystem read, not indexer work. Confirmed.
- `./scripts/check-shared.sh` currently reports **OK** — the two vendor copies are identical today, closing the spec's fourth "Could not establish".

D1–D4 are all buildable as written. Findings:

| Requirement | Problem | Effect on this plan |
| --- | --- | --- |
| `specs/09-project-context.md:75` (R1) — "last-modified commit info" per document | **Not buildable as stated.** The clone is shallow: `simple-git.ts:16` records `CLONE_DEPTH=1`, and only `sync()` deepens (`RESYNC_FETCH_DEPTH`, `:81-85`). `git log <path>` on a depth-1 clone returns the clone commit for every file, so the column would be the same value 800 times. Filesystem `mtime` is clone time, not commit time — worse, because it looks real. Calling `git.log(repo, path)` (`adapters.ts:225`) 800 times is also the dominant cost of the list request. | **Assumed as:** per-document `size` + `mtime` are **not** shipped as "last modified"; the list carries one `head_sha` for the whole scan, which D4's footer already requires. Per-document commit info is dropped. Flagged in Recommendations. |
| `:88` (R13) — sidebar nav entry | `NAV` lives in `client/src/vendor/ui/nav.ts:21-42`, and `CLAUDE.md` marks `**/src/vendor/**` do-not-touch with an exception **only** for `vendor/shared`. R13 requires editing a vendored file. `activeKeyFor` already returns `"context"` (`app-shell/helpers.ts:30`), so only the `NAV` array is missing. | **Assumed as:** one deliberate `vendor/ui/nav.ts` entry under `WORKSPACE`, treated as the same class of exception as `vendor/shared`, isolated in its own phase so it can be reverted alone. **This is the one decision I would escalate** — if refused, the page is URL-only and needs an alternative entry point. |
| `:207` (C4) / `:225` (NF-scale) — 400 KB ceiling and 1 000-document cap "mirroring" `repo-intel/constants.ts:42-44` | Not a contradiction, but the constants are **in another module**. `no-cross-module-internals` (`.dependency-cruiser.cjs`) forbids `modules/project-context/` importing `modules/repo-intel/constants.ts`. Copying them means two lists that drift, and a drifted `EXCLUDED_DIRS` lists `node_modules/**/*.md`. | **Resolved in-plan:** `EXCLUDED_DIRS` and `MAX_FILE_SIZE` move to `modules/_shared/walk-limits.ts`; `repo-intel/constants.ts` re-exports them so its importers are untouched. Phase T3. |
| `:224` (NF-latency) — "< 1 s p95 for 500 `.md` files", counts "cached by content hash" | Not checkable from outside without a measurement, and nothing in the repo measures it. Cold-start cost is real: 500 docs × ~5 KB through `js-tiktoken` `cl100k_base` (`adapters/tokenizer/index.ts:31`) is unbudgeted. | **Assumed as:** in-process LRU keyed by content hash (no table, no migration); the bound is treated as a **measured checkpoint in Phase A2**, not an assertion. Risk row below names the fallback. |
| `:226` (NF-cost) vs `adapters/tokenizer/index.ts:8-12` | The tokenizer adapter's own doc comment scopes it "in-process, **ONLY** under modules/repo-intel". R3 requires the same counter from a new module. | **Assumed as:** widen the scope deliberately — `container.tokenizer` is on the container and `pnpm arch` does not restrict it (stateless helpers are explicitly excluded from `injected-adapters-only-from-container`). The comment is amended in the same phase, since `server/INSIGHTS.md:49-53` is explicit that a second counter is the rejected option. |
| `:352` (Q1), `:353` (Q2), `:354` (Q3) | None block planning. Q1 is one constant plus a choice already made by "separate budgets" (skills' budget is chars, `skills/constants.ts:MAX_SKILLS_BLOCK_CHARS`, and this one is tokens — they cannot share a budget without unifying units, so "separate" is nearly forced). Q2 is one array literal. Q3 is a self-contained UI slice. | Defaults adopted: 25 % / separate budgets; `.md` + `.markdown`; Q3 badge shipped as Phase B4, which is the one phase deletable without touching another. |
| `:284` (Traps) — "`specs/02-skills.md:178-184` is stale" | Confirmed stale: `run-executor.ts:246-248` does call `resolveSkills`. | None — plan copies the code pattern, not that paragraph. |

## Context read

| Source | What it settled |
| --- | --- |
| `specs/09-project-context.md:1-378` | The whole feature; D1–D4 are closed and not re-opened here |
| `reviewer-core/src/prompt.ts:135-137,164,183` | The `specs` slot renders and traces already; only the label is positional (`spec-<i>`) and needs replacing (R11) |
| `reviewer-core/src/review/run.ts:61,139` | `ReviewInput.specs?: string[]` passes straight through to `PromptParts.specs` — one hop, one shape to widen |
| `server/src/modules/reviews/run-executor.ts:254-283,382,614` | The cut wire, and the exact shape of an "omit when empty" argument to copy |
| `server/src/modules/skills/assembler.ts:1-115` | The pattern to mirror exactly: a module-owned assembler, constructed in the container, taking `Db`, returning `{blocks, used, disabled, dropped, notes}` with every exclusion as a log note |
| `server/src/platform/container.ts:93-96,113-114,151-154` | `git`, `skills`, `tokenizer` getters — where `projectContext` is wired, and how the git port is reached without importing `SimpleGitClient` |
| `server/.dependency-cruiser.cjs` | `no-cross-module-internals` blocks reusing `repo-intel` constants; `injected-adapters-only-from-container` blocks importing `adapters/llm/*` and `adapters/git/simple-git` outside the container |
| `server/src/adapters/git/simple-git.ts:64,86,129-131` | `sync()` = `reset --hard` (D1's evidence, verified); `readFile` is `join(clonePath, path)` with **no traversal guard** — R11's "no path outside the clone root" is on us |
| `server/src/adapters/git/simple-git.ts:16,81-85` | `CLONE_DEPTH=1` — the audit finding on R1's commit info |
| `server/src/db/schema/agents.ts:52-64` | `agent_skills(agent_id, skill_id, order)` — the shape the attachment table mirrors |
| `server/src/db/schema.ts:1-60` | Barrel + `schema` object; a new schema file needs an entry in both |
| `server/src/modules/index.ts:2-13` | Static module registry — a new module is one import + one entry |
| `server/src/modules/reviews/prompt-log.ts:6-16,51` | Structurally text-free by design; `specs` already has a source label |
| `server/src/vendor/shared/adapters.ts:16-27,205-227` | `ModelInfo.contextLength` exists; `GitClient` has `readFile`/`clonePathFor` but **no directory listing** — discovery walks the filesystem itself |
| `server/src/adapters/llm/pricing.ts:10` | Where the static window table goes, and why it must be reached via the container |
| `server/INSIGHTS.md:49-53` | "The repo has exactly one counter" — a second estimator is already rejected |
| `INSIGHTS.md:211-219` | No second copy of large text in `PromptAssembly` — `specs_used` stays metadata-only |
| `INSIGHTS.md:337-352` | The vendor pair has drifted before, non-additively; `check-shared.sh` is a gate, not a formality |
| `INSIGHTS.md` (Recurring Errors, 2026-08-17) | 15 of 42 server test files are `*.it.test.ts` with `testTimeout: 120_000` — phase gates must be scoped |
| `client/src/vendor/ui/nav.ts:21-42` | "Only routes that exist are listed" — and it is vendored |
| `client/src/components/app-shell/helpers.ts:30` | `activeKeyFor` already returns `"context"`; no change needed there |
| `client/messages/en/context.json:1-24` | Exists and describes a different product (`.devdigest/specs/`, edit/save) |
| `client/messages/en/runs.json:25,38,53` | Trace strings live here, incl. `specs: "Project context (dynamic)"` |
| `client/src/lib/hooks/core.ts:154-169` | Two dead hooks; `useReindexContext` points at `/repos/:id/context/reindex`, a route that will never exist |
| `client/package.json:22` | `react-markdown ^9.0.3` is already a dependency — no new renderer |
| `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/` | The folder shape a route-local view follows here |
| `./scripts/check-shared.sh` (run) | Vendor copies identical **today** — the baseline this plan must preserve |

## Prior art and rejected approaches

- **2026-08-09, `server/INSIGHTS.md:49-53`** — a second, cheaper token estimator for trace fields was rejected; the repo has exactly one counter (`container.tokenizer.count` via `describePromptSections`). **Consequence:** all counts here — page, trace, cap — come from `container.tokenizer.count` and nowhere else. No client-side estimation.
- **2026-08-09, `INSIGHTS.md:211-219`** — adding a `diff` field to `PromptAssembly` was rejected: the trace already persists `user`, so a second copy doubles the largest thing in the document. **Consequence:** `specs_used` carries path/sources/tokens/status only. Never document text. The spec reaches the same conclusion at `:183-196`.
- **2026-08-09, `INSIGHTS.md:337-352`** — the two `@devdigest/shared` copies drifted non-additively (`provider` enum), and nothing failed until a valid server response was rejected by the client's own parser. **Consequence:** `check-shared.sh` is a phase gate on T1, not only an end-of-run gate.
- **2026-08-17, `INSIGHTS.md` Recurring Errors** — a bare `pnpm test` as a per-phase gate pays for testcontainers Postgres on every phase. **Consequence:** every phase gate below is scoped and `--reporter=dot`.
- **Spec D1, `:295-311`** — in-place document editing rejected on evidence (`simple-git.ts:86` `reset --hard`, `:64` destructive re-clone). Not retried.
- **Spec `:61-63`** — chunking/embedding rejected; no embedding infrastructure exists in `repo-intel/pipeline/` to reuse. Not retried.

## Scope

**In:** filesystem discovery of `.md`/`.markdown` in the clone · list + single-document read endpoints · attachment table and toggles for skills and agents · server-computed token counts (post-dedup, post-cap) · run-time injection through the existing `specs` slot · `specs_used`/`specs_tokens`/`specs_read` trace attribution · path-labelled untrusted wrapping with sanitisation · `/repos/:repoId/context` page with left rail, read-only rendered body, Skills/Agents tabs · Rescan via `POST /repos/:id/resync` · 25 %-of-window warning and run-time cap · Q3 read-only badge on the Agents list.

**Out:** editing/creating/deleting documents (D1) · a Context tab in the Agent editor · chunking, embedding, retrieval · non-markdown formats · attaching to system features · any change to `SUPPORTED_EXT` or the code index · pinning attachments into `agent_versions` (D3) · per-document last-modified commit info (audit finding) · `.gitignore` honouring (pre-existing gap, `pipeline/walk.ts:14-19`) · a persisted token-count table unless A2's measurement demands one · any change under `mcp/src/tools/` (R12 is inherited, and verified, not built).

## Contract changes

All in `server/src/vendor/shared/`, mirrored by `./scripts/check-shared.sh --fix`. **Phase T1, before any fan-out.**

1. `contracts/platform.ts:257-263` — `SpecFile` → `ProjectContextDoc` (list row): `path`, `size`, `tokens` (nullish = not yet counted, so the UI renders a skeleton not a `0`, per C5), `agent_count`, `skill_count`, `missing: boolean`, `too_large: boolean`. **No `content`.** Plus `ProjectContextList { docs, head_sha, truncated, limit, total_tokens }` for R1/R3a/D4/C3/C6, and `ProjectContextDocDetail { path, content, tokens, attachments, github_url, missing }`.
2. New `ProjectContextAttachment { path, target_kind: 'agent'|'skill', target_id, order }` — mirroring `agent_skills` (`schema/agents.ts:52-64`), which already carries `order`, the order R8 drops from.
3. `contracts/trace.ts` `PromptAssembly` gains **exactly two** fields, both `.nullish()`, mirroring `skills_used`/`skills_tokens` (`:52-67`): `specs_used: z.array(SpecUsed).nullish()` where `SpecUsed = { path, sources: string[], tokens, status: 'injected'|'dropped'|'skipped' }`, and `specs_tokens: z.number().int().nullish()` — null, never 0, when there is no `specs` slot.
4. `RunTrace.specs_read` (`:110`) — shape unchanged; it stops being hard-coded.
5. `reviewer-core`: `ReviewInput.specs` and `PromptParts.specs` widen from `string[]` to `Array<{ source: string; text: string }>`. Verified safe: the only caller is `run-executor.ts:254` and it never passes `specs`.

`client/src/lib/hooks/core.ts:158` swaps `SpecFile` → `ProjectContextDoc` in the same phase, or client typecheck goes red.

## Execution mode — recommendation and evidence

| Points to parallel tracks | Evidence here |
| --- | --- |
| Non-overlapping file sets | Track A writes only `server/**`; Track B writes only `client/**`. No file is in both. |
| Packages independent once the contract lands | The contract fixes every number the client renders — Track B never computes a token total (see A2's decision), so it is a pure renderer against a frozen shape. |
| Enough work that serialising is the bottleneck | 14 requirements, 15 corner cases, 14 acceptance criteria, a new server module, a new client route tree, a schema change and an engine change. |

| Points to a single implementer | Evidence here |
| --- | --- |
| Everything hangs off one shape still moving | Mitigated: the shape is frozen in T1 and `check-shared.sh` gates it. |
| A handful of files | Not the case. |

**Recommendation: parallel tracks**, with a three-phase serial trunk. The trunk is not negotiable — two agents editing `vendor/shared` is the one failure this repo cannot absorb cheaply (`INSIGHTS.md:337-352`).

## Trunk — landed before any fan-out

Single-threaded, in order. No track starts until T3 is green.

### Phase T1 — Contracts
- **What lands:** every shape both tracks depend on exists and both vendor copies are identical.
- **Files:** `server/src/vendor/shared/contracts/platform.ts`, `server/src/vendor/shared/contracts/trace.ts`, `client/src/vendor/shared/**` (via `--fix`, never by hand), `client/src/lib/hooks/core.ts:158`.
- **Placement decision:** `specs_used` is metadata only — `{path, sources, tokens, status}` — because the block's full text is already in `prompt_assembly.specs` and again in `user`. A third copy is the exact mistake `INSIGHTS.md:211-219` records. Both new fields are `.nullish()` so traces written before today still parse.
- **Governing skill:** — (contract only)
- **Gate:** `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · `./scripts/check-shared.sh`
- **Done when:** `check-shared.sh` prints OK and both typechecks pass with `ProjectContextDoc` in use at `core.ts:158`.
- **Depends on:** nothing

### Phase T2 — Engine: path-labelled, sanitised untrusted blocks
- **What lands:** `assemblePrompt` labels each project-context block with its document path instead of `spec-<i>`, and a path cannot escape the `source="…"` attribute (R11, C13, A12).
- **Files:** `reviewer-core/src/prompt.ts:30-34,79,135-137`, `reviewer-core/src/review/run.ts:61,139`, `reviewer-core/test/`.
- **Placement decision:** sanitisation goes **inside** `wrapUntrusted` as a `sanitiseLabel()` applied to every label, not only to spec paths — `wrapUntrusted` is the single chokepoint for all seven untrusted blocks, and a caller-side sanitiser is one that a future caller forgets. Strip `"`, `<`, `>`, CR/LF; clamp to 200 chars. Content escaping at `:32` is unchanged and still covers `</untrusted>`.
- **Governing skill:** — (`reviewer-core` is a pure package, outside the onion rules)
- **Gate:** `cd reviewer-core && npm test && npm run typecheck`
- **Done when:** a test asserts that for two documents the assembled user message contains exactly two `<untrusted source="…">`/`</untrusted>` pairs, each `source` equal to the sanitised path; and that with `specs` absent the assembled message is byte-identical to the recorded pre-feature baseline (A4's second half).
- **Depends on:** T1

### Phase T3 — Persistence and shared walk limits
- **What lands:** the attachment table exists, and one list of excluded directories exists.
- **Files:** `server/src/db/schema/project-context.ts` (new), `server/src/db/schema.ts` (barrel + `schema` object), `server/src/modules/_shared/walk-limits.ts` (new), `server/src/modules/repo-intel/constants.ts:17-26,43` (re-export, not redefine), `server/src/db/migrations/**` (generated).
- **Placement decision:** a **new schema file**, not an addition to `schema/context.ts` — that file is the code index (chunks/symbols/references) and `.md` is deliberately outside it. Table `project_context_attachments(workspace_id, repo_id, path, target_kind, target_id, order, created_at)`, PK `(repo_id, path, target_kind, target_id)`. **No documents table:** documents are files, not rows, which is what makes R10 free — a deleted file leaves its attachment untouched. `EXCLUDED_DIRS`/`MAX_FILE_SIZE` move to `modules/_shared/` because `no-cross-module-internals` forbids the import and a copied list silently lists `node_modules`.
- **Governing skill:** `onion-architecture` — the `db-no-outward` and `no-cross-module-internals` rules are both live here; invoke it before writing the `_shared` re-export.
- **Gate:** `cd server && pnpm db:generate && pnpm db:migrate && pnpm typecheck && pnpm arch`
- **Done when:** one generated migration exists (adds only — a single `db:generate` is correct here; the two-generate rule in `server/INSIGHTS.md` applies only to add+drop on one table), `pnpm arch` shows no new violation against the 11-violation baseline, and `repo-intel`'s existing importers of `EXCLUDED_DIRS` compile unchanged.
- **Depends on:** T1

## Tracks

### Track A — Server: discovery, attachment, injection, trace

- **Agent:** `implementer`
- **Owns exclusively:** `server/src/modules/project-context/**` · `server/src/modules/reviews/run-executor.ts` · `server/src/modules/index.ts` · `server/src/platform/container.ts` · `server/src/adapters/llm/pricing.ts` · `server/src/adapters/tokenizer/index.ts` (comment only) · `server/test/project-context/**` · `server/test/reviews/**`
- **May read:** `server/src/modules/skills/assembler.ts` (the pattern), `reviewer-core/src/prompt.ts`
- **Governing skill:** `onion-architecture`

#### Phase A1 — Module skeleton and discovery
- **What lands:** `GET /repos/:id/context` returns the repo's `.md`/`.markdown` documents with paths and sizes (A1).
- **Files:** `modules/project-context/{routes,service,repository,discovery,constants,helpers}.ts`, `modules/index.ts`, `platform/container.ts`, `test/project-context/discovery.test.ts`.
- **Placement decision:** the module **earns a service** — it applies real rules (walk limits, dedup, cap, budget resolution) and orchestrates two sources (filesystem + DB), so `routes.ts → service.ts → repository.ts`, never route→db (`routes-no-db`). Discovery lives in its own `discovery.ts`, **not** `helpers.ts`: `helpers-are-pure` makes `helpers.ts` domain-only, and discovery does filesystem I/O. It reaches the clone through `container.git.clonePathFor(repo)` — the **port** from the container — because `injected-adapters-only-from-container` forbids importing `adapters/git/simple-git` anywhere but the composition root. `GitClient` has no directory listing (`adapters.ts:205-227`), so the walk is a local `readdir` recursion that copies `pipeline/walk.ts:89-101`'s two hard rules: `if (entry.isSymbolicLink()) continue` and the excluded-dir set (now from `_shared`). Caps: 1 000 documents, 400 KB per document, both reported in the response so the UI states the limit (C3, C4).
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/project-context` · `pnpm arch`
- **Done when:** an `.it.test.ts` against a fixture clone containing `README.md`, `docs/a.md` and `node_modules/x/b.md` returns exactly the first two with full repo-relative paths (A1); a symlinked `.md` is absent; `pnpm arch` is unchanged against baseline.
- **Depends on:** T3

#### Phase A2 — Token counts, cache, and the measurement
- **What lands:** every listed document carries a token count from the one counter, and the list's latency is a measured number rather than an assumption.
- **Files:** `modules/project-context/{service,token-cache}.ts`, `adapters/tokenizer/index.ts` (doc comment), `test/project-context/tokens.test.ts`.
- **Placement decision:** counts come from `container.tokenizer.count` and nowhere else — `server/INSIGHTS.md:49-53` already rejected a second estimator. Cache is an **in-process LRU keyed by content hash**, capped at 2 000 entries, in the service — no table, no migration, because nothing in the spec requires the count to survive a restart and a table is a schema change bought on a guess. The tokenizer's "ONLY under modules/repo-intel" comment is amended in this phase, deliberately, rather than left to contradict the code.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/project-context`
- **Done when:** A3 passes — the returned count equals `container.tokenizer.count(exactFileContent)` asserted against the same counter, not a re-implementation; and the cold-start wall time for a 500-document fixture is **recorded in the phase output**. If it exceeds 1 s, stop and escalate rather than silently shipping over the NF bound.
- **Depends on:** A1

#### Phase A3 — Attachments
- **What lands:** documents can be attached to and detached from agents and skills, and the counts on the list reflect it (A2).
- **Files:** `modules/project-context/{routes,service,repository}.ts`, `test/project-context/attachments.it.test.ts`.
- **Placement decision:** `PUT /repos/:id/context/attachments` replaces the whole attachment set for one document in one statement — which is why C9's "last write wins, no merge dialog" is free and why **no transaction is needed**. The server has historically had none (`INSIGHTS.md`), and this is a single write. `GET /repos/:id/context/doc?path=…` returns the detail; the path is validated by resolving it against `clonePathFor(repo)` and rejecting anything that escapes the root — `simple-git.ts:129-131` is a bare `join()` with no guard, so R11's containment is this service's job, not the adapter's.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot test/project-context` (this lane includes the `.it.test.ts`; it is the one place Docker is worth paying for mid-track)
- **Done when:** A2 passes both directions; a `../../etc/passwd` path returns 400 and reads nothing.
- **Depends on:** A2

#### Phase A4 — Assembler: dedup, budget, cap
- **What lands:** a `ProjectContextAssembler` that turns an agent id into the exact blocks a run will inject, with every exclusion as a log note.
- **Files:** `modules/project-context/assembler.ts`, `platform/container.ts`, `adapters/llm/pricing.ts`, `test/project-context/assembler.test.ts`.
- **Placement decision:** mirrors `SkillAssembler` exactly (`skills/assembler.ts:57-115`): constructed in the container as `container.projectContext`, takes `Db` + the git port, returns `{ blocks, used, dropped, skipped, disabled, notes }`, and **never reads `agent_skills` itself** — the agents module hands the linked skill ids in as values, preserving the ownership split. Dedup (R6) is by repo-relative path, keeping both source labels on the surviving entry. The window fallback chain (R7) is `ModelInfo.contextLength` → new `CONTEXT_WINDOWS` table beside `PRICING` in `adapters/llm/pricing.ts:10` → flat 30 000; it is exposed **through the container** (mirroring `container.ts:23`'s `estimateCost` import) because `injected-adapters-only-from-container` forbids a module importing `adapters/llm/*`. A globally disabled skill contributes nothing (C14), matching `assembler.ts`'s `enabled` filter.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/project-context`
- **Done when:** a hermetic test proves C11 (one block, one count, two sources), C12 (tail dropped whole-document, never truncated, each drop a note), C14 (disabled skill's documents absent), and that a model in neither `contextLength` nor `CONTEXT_WINDOWS` resolves to 30 000 rather than warning about `null`.
- **Depends on:** A3

#### Phase A5 — Wire the run and the trace
- **What lands:** the cut wire is connected; a run injects documents and the trace says which (A4, A5, A7, A9, A11).
- **Files:** `modules/reviews/run-executor.ts:246-283,370-385,600-615`, `test/reviews/*.it.test.ts`.
- **Placement decision:** one new `resolveProjectContext()` private beside `resolveSkills` (`:448-466`), reaching the assembler **through the container** — `reviews` importing `project-context` internals would break `no-cross-module-internals`. The argument uses the same omit-when-empty spread as its siblings (`...(specs.blocks.length > 0 ? { specs: specs.blocks } : {})`), which is what makes A4's byte-identical guarantee structural rather than tested-into-existence. `specs_tokens` is read from `sections.find(s => s.section === 'specs')?.tokens ?? null` — the same line as `skills_tokens` at `:370`, so there is still exactly one counter. `specs_read` at `:382` becomes the injected paths; the failure path at `:614` stays `[]`. **Nothing is added to `prompt-log.ts`** beyond what already exists at `:51` — it is structurally text-free and stays that way.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot test/reviews` · `pnpm arch` · `pnpm typecheck`
- **Done when:** A4, A5, A7, A9, A11 pass; a contract test asserts `PromptAssembly` has no field holding a second copy of the document text outside `specs`/`user`; and an agent with no attachments produces a user message byte-identical to a recorded pre-feature fixture.
- **Depends on:** A4

#### Phase A6 — Rescan and missing documents
- **What lands:** the list refreshes on clone/refresh/resync and reports `head_sha`; a deleted attached document is `missing`, not detached (R9, R10, C6, C8).
- **Files:** `modules/project-context/{service,repository}.ts`, `test/project-context/rescan.it.test.ts`.
- **Placement decision:** **no new job kind and no second index.** Discovery is stateless — it reads the clone on request — so "rescan" is `POST /repos/:id/resync` (`repo-intel/routes.ts:43-65`, already returning 202) followed by a refetch. `missing` is computed by set-differencing attachment paths against discovered paths; nothing is written, which is what makes "a rename back restores it" true for free.
- **Gate:** `cd server && pnpm exec vitest run --reporter=dot test/project-context`
- **Done when:** A11 passes — the document reports `missing`, the attachment row still exists, contributes 0 tokens, and a subsequent run completes with a skip line in the log.
- **Depends on:** A5

---

### Track B — Client: the Project Context page, trace attribution, agent badge

- **Agent:** `implementer`
- **Owns exclusively:** `client/src/app/repos/[repoId]/context/**` · `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/**` · `client/src/app/agents/**` · `client/src/lib/hooks/core.ts` · `client/messages/en/context.json` · `client/messages/en/runs.json` · `client/src/vendor/ui/nav.ts`
- **May read:** `server/src/vendor/shared/**` (frozen at T1), `client/src/app/repos/[repoId]/conventions/**` (the shape to follow)
- **Governing skill:** `frontend-ui-architecture`

#### Phase B1 — Route, nav, and the rewritten i18n bundle
- **What lands:** `/repos/:repoId/context` renders and the sidebar entry activates on it (A14, R13).
- **Files:** `client/src/app/repos/[repoId]/context/page.tsx`, `_components/ProjectContextView/{ProjectContextView.tsx,index.ts,styles.ts,constants.ts}`, `client/src/vendor/ui/nav.ts:21-26`, `client/messages/en/context.json`.
- **Placement decision:** the view is **route-local** — `app/repos/[repoId]/context/_components/ProjectContextView/`, not `src/components/` — because exactly one route consumes it and the second-route promotion threshold is not met; `ConventionsView` is the precedent in the sibling folder. The nav entry goes in the `WORKSPACE` group beside Pull Requests, since it is repo-scoped and uses the `:repoId` token that `resolveHref` already substitutes. **`activeKeyFor` is not touched** — `app-shell/helpers.ts:30` already returns `"context"`. `context.json` is rewritten, not extended: `:13`'s `.devdigest/specs/` sentence contradicts D1, and `mode.edit`/`editor.save` (`:15-23`) stay in the file, unused, rather than being wired to something that would lose work.
- **Governing skill:** `frontend-ui-architecture` — the placement call above is the one it governs; invoke it before creating the folder if the `_components` depth exceeds two levels.
- **Gate:** `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot src/app/repos && pnpm lint`
- **Done when:** the route renders, the sidebar highlights, and a test asserts no user-facing literal in the JSX (A14). `pnpm lint` shows 0 errors and no more than 42 warnings.
- **Depends on:** T1 (contracts only — this phase mocks the API)

#### Phase B2 — Left rail: list, states, footer
- **What lands:** the document list with every state the mock omits (C1, C2, C3, C5, C6).
- **Files:** `_components/ProjectContextView/_components/DocList/**`, `helpers.ts`, `helpers.test.ts`, `client/src/lib/hooks/core.ts:154-169`.
- **Placement decision:** `useContextFiles` is retyped to `ProjectContextList` and `useReindexContext` is **repointed** from the nonexistent `/repos/:id/context/reindex` to `POST /repos/:id/resync`. Both stay in `lib/hooks/core.ts` where they already are. The footer renders `N files · M tokens total` from the server's `total_tokens` — **the client never sums tokens**, which is what makes R3a's "the page number is the run number" structural rather than a coincidence that drifts. Grouping by directory and the full repo-relative path per row (not basenames) is required by C3, not a UX proposal. `indexing` (C1) and `empty` (C2) are distinct states; the empty state explains where DevDigest looked and offers Rescan, with no "Add a spec file" CTA.
- **Gate:** `cd client && pnpm exec vitest run --reporter=dot src/app/repos && pnpm typecheck`
- **Done when:** A3a's two label assertions pass (footer reads as a ceiling, over-cap rows struck through with a reason) and A10's Rescan issues `POST /repos/:id/resync`.
- **Depends on:** B1

#### Phase B3 — Document pane and attachment tabs
- **What lands:** opening a document renders it read-only with Open on GitHub, and the Skills/Agents tabs attach and detach (A2, A8, C8, C9, C10).
- **Files:** `_components/DocViewer/**`, `_components/AttachTabs/{SkillsTab,AgentsTab}/**`.
- **Placement decision:** rendering uses `react-markdown` (`client/package.json:22`) — already a dependency, no new one. There is **no Preview/Edit toggle**; "Open on GitHub" at the path on the default branch replaces it (D1). The `COVERAGE` ring is replaced by "Used by N agents", server-supplied, clicking through to the Agents tab (D2). Toggles are pessimistic: revert on failure, never leave optimistic state claiming an attachment that did not persist. The 25 % warning is announced to screen readers and never blocks save.
- **Gate:** `cd client && pnpm exec vitest run --reporter=dot src/app/repos && pnpm typecheck && pnpm lint`
- **Done when:** A2's client half and A8 pass; the tabs remain usable when the body fails to load or the document is missing (C8), and a deep-linked missing path shows "not found in this repo" without navigating away (C10).
- **Depends on:** B2

#### Phase B4 — Trace attribution and the agent badge
- **What lands:** the Run Trace names the injected documents (A6), and the Agents list shows the read-only count (Q3).
- **Files:** `RunTraceDrawer/_components/TraceBody/TraceBody.tsx:120-124`, `client/messages/en/runs.json`, `client/src/app/agents/**`.
- **Placement decision:** the `specs` `PromptBlock` gains a `note`, exactly copying the `skills` block's null-handling at `:87-116` — `specs_used == null` means an old trace, not "no documents", and the note falls back when `specs_tokens` is null so nothing renders "undefined tok". The C15 label (replay reads today's documents, not pinned ones) is a string on this block, since it is the only place a reader would be misled. The Agents badge is read-only with no controls, per Q3's default, and is the one phase that can be deleted without touching another.
- **Gate:** `cd client && pnpm exec vitest run --reporter=dot src/app && pnpm typecheck && pnpm lint`
- **Done when:** A6 passes — the paths are listed and the full injected text opens in the existing fullscreen viewer.
- **Depends on:** B3, and **A5's contract fields being populated** for the e2e half (the unit test uses a fixture trace and does not wait)

---

**Synchronisation points**

1. **After A5 and B3.** Both tracks stop; run `./scripts/check-shared.sh` (proves neither track hand-edited a vendored contract), then `cd server && pnpm test` and `cd client && pnpm test`. Nothing proceeds red.
2. **Join phase J1 — e2e and MCP parity.** Single implementer, after both tracks finish. Adds `e2e/specs/12-project-context.flow.json` covering A6, A10 and A14; verifies A13 by triggering a run through the MCP `run_agent` tool and diffing `specs_read` against a web-triggered run for the same agent and PR — **with no change under `mcp/src/tools/`**, which is the assertion, not a side effect. Gate: `cd e2e && npm run e2e:hermetic` · `cd mcp && npm test && npm run typecheck`.
3. **Join phase J2 — insights.** Run the `engineering-insights` skill. At minimum, one entry is already earned: the shallow-clone finding that killed R1's per-document commit info (`server/INSIGHTS.md`), and the `_shared/walk-limits.ts` move as the arch-legal answer to cross-module constant reuse.

## Verification matrix

| Command | Package | What it proves |
| --- | --- | --- |
| `./scripts/check-shared.sh` | root | The two `@devdigest/shared` copies are identical — the drift at `INSIGHTS.md:337-352` did not recur |
| `pnpm typecheck` | server | The contract change reaches every consumer |
| `pnpm test` | server | All 42 files incl. the 15 `*.it.test.ts` — A1, A2, A3, A4, A5, A7, A9, A11 |
| `pnpm arch` | server | No new dependency-cruiser violation over the 11-violation baseline; specifically that `project-context` reaches git and the LLM window table only through the container, and `reviews` never imports `project-context` internals |
| `pnpm build` | server | Emit is unaffected by the vendor path-alias program |
| `npm test` + `npm run typecheck` | reviewer-core | A4's byte-identical baseline, A12's delimiter/label safety |
| `pnpm typecheck` · `pnpm test` · `pnpm lint` · `pnpm build` | client | A3a, A6, A8, A10, A14; lint at 0 errors / ≤42 warnings |
| `npm run e2e:hermetic` | e2e | A6, A10, A14 as browser flows |
| `npm test` + `npm run typecheck` | mcp | A13 — MCP inherits the feature with no tool change |
| `cd server && pnpm db:migrate` on a pre-existing DB | server | The migration applies without touching existing rows |

## Traps for this change

- **The `specs` slot already exists.** `prompt.ts:135-137,164,183`, `trace.ts:42`, `prompt-log.ts:51`, `TraceBody.tsx:120-124`. Adding a parallel "project context" slot produces two blocks that disagree. The missing piece is **one argument** at `run-executor.ts:254`.
- **`prompt-log.ts` must stay text-free** (`:6-16`). Its own header says a `sample`/`preview` field "would defeat the whole file — don't". R5's full text comes from the persisted trace.
- **`git.readFile` has no traversal guard** (`simple-git.ts:129-131` is a bare `join`). Containment is Phase A3's job.
- **`pnpm arch` blocks three imports this feature will reach for:** `repo-intel/constants.ts` (`no-cross-module-internals` → hence `_shared/walk-limits.ts`), `adapters/git/simple-git` and `adapters/llm/pricing` (`injected-adapters-only-from-container` → hence container getters). The 11-violation baseline is **never regenerated**.
- **`client/src/vendor/ui/nav.ts` is vendored** and R13 requires editing it. Isolated to Phase B1 so it can be reverted alone. `activeKeyFor` needs no change.
- **`client/messages/en/context.json` already exists** and describes a `.devdigest/specs/` folder you edit — reusing its keys unchanged ships copy that contradicts D1.
- **pnpm vs npm:** `server/` and `client/` are pnpm; `reviewer-core/`, `e2e/` and `mcp/` are npm. T2 and J1 are the npm phases.
- **Migrations are generated.** T3 adds only, so one `pnpm db:generate`. The two-generate rule (`server/INSIGHTS.md`) applies to add+drop on one table and does not bite here.
- **Never `docker compose down -v`** to reset the test database — it destroys `devdigest_pgdata` and every imported repo.
- **Exclude `server/clones/**` from every grep.** It contains a full copy of this repository, including a copy of the files this plan edits.
- **`.gitignore` is not honoured by the walk** (`pipeline/walk.ts:14-19`, TODO). A repo with generated markdown in an ignored directory will list it. Pre-existing; not fixed here.
- **No transactions historically.** The attachment write is a single statement, so this is fine — but do not add a second write to that path without moving the boundary into the service.

## Risks and unknowns

- **Cold-start token counting for 500 documents may exceed the 1 s NF bound.** Unknown until measured; `js-tiktoken` throughput on ~2.5 MB is not recorded anywhere in the repo. **Measured in Phase A2** (~20 minutes). If wrong: the list returns rows with `tokens: null` immediately and counts stream in, which the contract already permits (`tokens` is nullish and the UI renders a skeleton per C5) — no contract change, one extra endpoint.
- **The in-process LRU loses its cache on restart.** If a table turns out to be needed, it is an additive migration and a repository method — contained to Track A, but it lands after T3, so it would be a second `db:generate`.
- **The `vendor/ui/nav.ts` edit may be refused.** If so: the page is reachable only by URL, and the alternative entry point (a link from the repo header or the Pull Requests page) is a Track B change of similar size. Flagged now because discovering it at review time wastes the whole of B1.
- **`repos.defaultBranch` may never be populated from GitHub** (`schema/repos.ts:15` defaults to `'main'`). Affects R9's rescan on a non-`main` default branch and R2's "Open on GitHub" link. Pre-existing (`repo-intel/service.ts:144-163`), not introduced here — but the GitHub link will 404 on such a repo. If it matters: read the branch from the clone's `HEAD` instead of the column.
- **`cl100k_base` drift from actual billing is unquantified.** Mitigated by labelling, not by measuring; the spec accepts this at `:363-367`.

## Recommendations

Not in the plan above. A human decides whether the spec changes.

- **Drop "last-modified commit info" from R1 formally.** As written it cannot be produced on a depth-1 clone (`simple-git.ts:16`), and the honest substitute — the `head_sha` the list was read at — is already required by D4's footer. Cost to change now: one line in R1. Cost later: an implementer either ships `mtime` labelled as a commit date (wrong, and looks right) or adds 800 `git log` calls to the list request.
- **Ship the "attachment badge + token count on every left-rail row" UX proposal** (`:137-140`) rather than leaving it `proposed`. It is the only thing that makes the page answer its own question without opening documents one at a time, and it is nearly free once B2 has the numbers.
- **Consider making the 25 % constant a settings value rather than a literal.** Q1 explicitly says "revisit against real traces", and a constant that is known to be provisional is cheaper as configuration than as a code change plus a deploy. Cost now: one row in the settings module. Not planned, because the spec's default is a constant.
- **Consider deferring Q3's Agents-list badge to a follow-up.** It is the only slice with no acceptance criterion behind it, and B4 is otherwise on the critical path for A6.

## What differs if a single implementer is chosen

- **The trunk is unchanged** — T1, T2, T3 run in the same order for the same reason.
- **Tracks become one sequence:** T1 → T2 → T3 → A1 → A2 → A3 → A4 → A5 → B1 → B2 → B3 → A6 → B4 → J1 → J2. Server before client throughout, because the phase that makes the feature *exist* (A5, the cut wire) must precede the phase that makes it visible.
- **Two merges:** B1 and B2 collapse into one phase (route + nav + list + hooks land together, since a single implementer gains nothing from a page with no data). A6 folds into A5 rather than following the client work.
- **One phase splits:** A5 splits into A5a (injection — A4, A7) and A5b (trace fields — A5, A9, A11), because a single implementer running the `test/reviews` `.it.test.ts` lane twice is cheaper than debugging a phase that changed both the prompt and the trace at once.
- **The file-ownership boundary disappears**, and with it synchronisation point 1 — `check-shared.sh` moves from a track-join gate to an end-of-run gate only.
- **Net cost:** roughly one extra phase, and the client work starts after A5 instead of after T3.

## Out of scope for the implementer

- Architecture review — a separate agent
- Security review — a separate agent (the untrusted-boundary and path-containment claims in T2/A3 are asserted by tests here, not audited here)
- The `vendor/ui/nav.ts` exception — a human decides before B1 starts
- Whether the R1 audit finding changes the spec — `specreator`'s and the CTO's call, not the implementer's
- Any change to `SUPPORTED_EXT`, the code index, or `.gitignore` handling in the walk
