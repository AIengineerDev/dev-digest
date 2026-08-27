# Project Context

**Status:** agreed — approved by the CTO 2026-08-18, ready to plan
**Packages touched:** server, client, reviewer-core (+ `@devdigest/shared` contracts; `mcp` inherits, no change)
**Design source:** `design-mocks/src/24-screen_tour_context.jsx:82-138` (`ScreenContext`, incl. its `empty` variant)
**Supersedes:** nothing
**Borders on:** `specs/02-skills.md` (a skill is author-written *trusted instruction text*; a project-context document is repo-authored *untrusted data* and is attached, never authored, here — the two never merge), `specs/06-mcp-server.md` (MCP triggers runs through the same `POST /pulls/:id/review`, so it inherits this feature without a tool change), `specs/04-intent-layer.md` (also renders an untrusted block into the same user message; unaffected).

## Problem

The engine already has a `## Project context` slot: `assemblePrompt` renders
`parts.specs` as delimiter-wrapped blocks
(`reviewer-core/src/prompt.ts:135-137,164`), the trace contract has a `specs`
slot (`server/src/vendor/shared/contracts/trace.ts:42`), the run log has a label
for it — `'project context specs (untrusted)'`
(`server/src/modules/reviews/prompt-log.ts:51`) — and the Run Trace drawer
already renders that slot
(`client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:74-131`).

**Nothing ever fills it.** `run-executor.ts:254-280` builds the
`reviewPullRequest` call with skills, callers, repo map, PR description and
intent — and never passes `specs`; `specs_read` is hard-coded `[]`
(`run-executor.ts:382,614`). The wire is cut on the server side, exactly as the
skills wire was before `specs/02-skills.md`.

So a reviewer whose repo contains the PRD that says "all public endpoints MUST
be rate-limited" gets a review that has never read it. The document exists, the
prompt slot exists, and there is no way to connect them. On the client side the
screen is pre-provisioned and unbuilt: a full i18n bundle titled "Project
Context" (`client/messages/en/context.json:1-24`), a dead active-key branch
(`client/src/components/app-shell/helpers.ts:30`), and two unrouted hooks
(`client/src/lib/hooks/core.ts:154-169`) against a `SpecFile` contract
(`server/src/vendor/shared/contracts/platform.ts:257-263`) that no server route
serves — `server/src/modules/repos/routes.ts:26-38` has `POST /repos`,
`GET /repos`, `POST /repos/:id/refresh` and nothing else.

## Scope — in / out

**In**

- Discovery and listing of every `.md` document in the imported repo's clone.
- A Project Context page: document list, read-only rendered document, and two
  tabs on the opened document — **Skills** and **Agents** — that attach it.
- Per-document and per-agent token counts, with a non-blocking overflow warning.
- Injection of an agent's attached documents into its review prompt, through the
  existing `specs` slot.
- Prompt Assembly attribution: which documents were attached, by which route,
  at what size, with the full injected text readable.

**Out**

- *Editing, creating, uploading or deleting documents.* The repo is the source
  of truth (Decision 1). DevDigest reads; it never writes into a user's clone —
  and could not usefully do so: `sync()` ends in `git reset --hard`
  (`adapters/git/simple-git.ts:86`), so a write would be destroyed silently at
  the next resync. See D1.
- *A Context tab in the Agent editor.* Attachment is managed in one place
  (Decision 2). The Agent editor's Skills tab
  (`client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx`)
  is untouched.
- *Chunking, embedding or retrieval of documents.* Attachment is explicit and
  whole-document. There is no embedding infrastructure in `repo-intel` to reuse
  (`server/src/modules/repo-intel/pipeline/`), and none is added.
- *Non-`.md` documents* (`.txt`, `.adoc`, `.rst`, PDFs).
- *Attaching documents to the system features* (`risk_brief`, `conformance`,
  `conventions` — `contracts/platform.ts:12-19`). Agents and skills only.
- *Changing how the code index works.* `.md` files stay outside `SUPPORTED_EXT`
  (`server/src/modules/repo-intel/constants.ts:14`); no symbols, no references,
  no `repo_map_cache` entry is produced for them.

## Requirements

| ID | Requirement | Source |
| --- | --- | --- |
| R1 | The Project Context page lists every `.md` file found in the imported repo's clone — any directory, not one fixed folder — each with its repo-relative path, byte size and last-modified commit info. Discovery honours the existing walk exclusions (`node_modules`, `dist`, `build`, `coverage`, `.next`, `out`, `vendor`, `.git` — `repo-intel/constants.ts:17-26`) and never follows symlinks (`pipeline/walk.ts:89`). | Decision 1 · CTO req 1 · design `24-screen_tour_context.jsx:83-118` |
| R2 | Opening a document shows its rendered content **read-only** — with **Open on GitHub** at that path on the default branch as the route to an editor (D1) — plus two tabs, **Skills** and **Agents**, each listing the workspace's skills / agents with a per-row toggle that attaches or detaches *this document*. The header shows **"Used by N agents"**, N being the deduplicated union of direct and skill-mediated attachments (R6), clicking through to the Agents tab filtered to them (D2). Attachment is recorded by repo-relative path. | Decision 2 · D1 · D2 · CTO req 2 · design `24:121-128` |
| R3 | Every listed document shows a token count computed from its current content, and each agent row shows that agent's **total** attached project-context tokens (its own attachments plus those from its linked skills, deduplicated per R6). Counts come from the single existing counter, `container.tokenizer.count` (`server/src/adapters/tokenizer/index.ts:26-38`), and are labelled as an estimate (see R7 / NF-cost). | CTO req 3 · `server/INSIGHTS.md:49-53` ("the repo has exactly one counter") |
| R3a | The counts on the page are **the counts the run will use**, not a raw file measure. Concretely: the per-agent total is computed **after** dedup (R6); any document the 25 % cap would drop (R8) is shown struck through with the reason, so the page never implies a document is contributing tokens it will not contribute; the left-rail footer's `M tokens total` is the sum over **all discovered** documents, labelled as the ceiling if everything were attached, never as a current cost. Where a page number and a trace number can still disagree — the document changed between selection and run — the trace is authoritative and says so. | CTO 2026-08-18 · R6 · R8 · C15 |
| R4 | When an agent run starts, the union of documents attached to that agent and to its enabled linked skills is read from the clone at run time and passed into the engine's existing `specs` slot, rendering as `## Project context` in the user message (`reviewer-core/src/prompt.ts:164`). An agent with no attachments produces a byte-identical prompt to today. | CTO req 4 · `run-executor.ts:254-280` (slot currently never populated) |
| R5 | The Run Trace's Prompt Assembly section names the attached documents under the `specs` slot: for each injected document its repo-relative path, the attachment source(s) (`agent` and/or `skill:<name>`), its token count, and the full injected text openable in the existing fullscreen prompt viewer. `RunTrace.specs_read` (`contracts/trace.ts:110`, hard-coded `[]` at `run-executor.ts:382`) carries the injected paths. | CTO req 5 · `TraceBody.tsx:74-131` · root `INSIGHTS.md:211-219` |
| R6 | A document attached to both an agent and to a skill that agent uses is injected **once**, and its tokens counted once, in both the UI total (R3) and the trace (R5). Both attachment sources are still listed for it. | Decision 3 |
| R7 | The page warns — and does not block saving — when an agent's total attached project-context tokens exceed **25 % of that agent's model context window**. The window is `ModelInfo.contextLength` when the provider populates it (`server/src/vendor/shared/adapters.ts:16-27`); when it is null — which is the case for every model today, since neither `listModels` sets it (`adapters/llm/anthropic.ts:92-101`, `adapters/llm/openai.ts:69-76`) — a static per-model fallback beside the existing static price table (`adapters/llm/pricing.ts:10-56`) supplies it; when the model is in neither, the budget is a flat **30 000 tokens**. | Decision 4 |
| R8 | The same 25 % figure is the **run-time cap**: if the assembled project-context block would exceed it, documents are dropped from the end of the attachment order — never truncated mid-document — and each drop is written to the run log and visible in the trace. What the page warned about is exactly what gets dropped. | Decision 4 · mirrors `specs/02-skills.md:186-200` overflow rule |
| R9 | A manual **Rescan** action refreshes the document list from the clone's current HEAD. It reuses the existing resync path (`POST /repos/:id/resync`, `server/src/modules/repo-intel/routes.ts:43-65`, which fetches origin then reindexes) rather than introducing a second, separately-drifting index. The list also refreshes on the same triggers the code index already has: clone, refresh, resync (`server/src/modules/repos/service.ts:60-78,113-138`). | Decision 1 · design `24:114` ("Re-index") |
| R10 | An attached document whose path no longer exists after a rescan (deleted, renamed or moved) is shown as **missing** on the Project Context page and on every skill/agent it is attached to. It is never auto-detached — the attachment survives so a rename back restores it — it contributes 0 tokens, is skipped at run time, and the skip is written to the run log. An attached document whose content changed is simply injected with its new content; there is no stale state. | Decision 1 · `pipeline/incremental.ts:108-118` (git-diff change detection) |
| R11 | Each injected document is wrapped in the engine's untrusted delimiter with its repo-relative path as the source label, replacing today's positional `spec-<i>` (`reviewer-core/src/prompt.ts:137`). The label is sanitised so a path cannot break out of the `source="…"` attribute or the block (`prompt.ts:30-34`), and no path outside the clone root is ever read. | `specs/02-skills.md:90-98` (untrusted-vs-instruction boundary) |
| R12 | A run triggered through the MCP server gets exactly the same attached context as one triggered from the web app, with no change to any MCP tool — both call `POST /pulls/:id/review` (`mcp/src/api.ts:121-127`, `mcp/src/tools/run-agent.ts:67`, `server/src/modules/reviews/routes.ts:34-51`). | `specs/06-mcp-server.md:29-45` |
| R13 | The page is reachable at `/repos/:repoId/context` from a sidebar nav entry, activating the existing `"context"` key (`client/src/components/app-shell/helpers.ts:30`). All strings are `next-intl` keys, extending `client/messages/en/context.json`. | `client/src/vendor/ui/nav.ts:21-42` ("Only routes that exist are listed") |

## Design analysis

### States the design covers

`ScreenContext` (`24-screen_tour_context.jsx:103-138`) draws exactly two:

- **Populated** — 240px left rail (folder label, four action buttons, flat file
  list with one active row, an "Indexed: 12 files · 1,240 chunks · last 5m ago" (replaced — see D4)
  footer) and a right pane (filename, `Preview | Edit` toggle, "Used by 3
  agents", a `COVERAGE 78` ring, rendered markdown body).
- **Empty** — `EmptyState` "No spec files yet" with a CTA "Add a spec file"
  (`24:104-105`).

### States it does not

| Axis | Gap (in `ScreenContext`) | Requirement |
| --- | --- | --- |
| Emptiness | Repo imported but never cloned/indexed yet; and "repo has zero `.md` files" is drawn identically to "we have not looked yet". The mock's one empty state also asks the user to *add* a file, which cannot happen (Decision 1). | R1 · R9 · C1 · C2 |
| Cardinality | A flat six-row list. One document; 800 documents across nested directories; two documents with the same basename in different directories (`docs/README.md` vs `README.md`) — the mock shows basenames only (`24:118`), which is ambiguous at any real repo size. | R1 · C3 |
| Extremes | A 700 KB generated changelog; a `.md` with a 40 000-character single line; a path 200 characters deep. Nothing in the mock constrains size, and nothing tells the user a document is too big to attach. | R1 · R8 · C4 |
| Time | No loading state for the list, the document body, or the token counts; no state for "rescan running" (though `context.json:5,7` already has `indexing` / `resyncing` strings); no stale-while-revalidating after a rescan. | R9 · C5 |
| Failure | No state for a failed rescan, a clone directory that has been deleted from disk, or a document that fails to read. The mock's green dot (`24:120`) is the only status affordance and has no unhappy counterpart. | R9 · R10 · C6 · C7 |
| Permission | n/a. The studio is single-workspace with one seeded user and no roles (`server/src/adapters/auth/local.ts:9-34`); every request already scopes to the same `workspace_id`. Attachments are workspace-scoped like agents and skills. | — |
| Concurrency | Nothing for: a rescan finishing while the user has a now-deleted document open; two tabs toggling the same attachment; a run starting while the user is mid-attachment. | R10 · C8 · C9 |
| Reachability | The mock has no nav entry and no crumb target — it is drawn inside `AppFrame` with `active: "context"` (`24:106`) for a nav item that does not exist (`nav.ts:21-42`). Nothing says what deep-linking a document does, or what Back does after opening one. | R13 · C10 |

### Divergence from `client/` today

| Mockup | Today (`path:line`) | Intended change (→ Rn) or mockup oversight (→ Qn) |
| --- | --- | --- |
| Whole `ScreenContext` screen | No route exists — `client/src/app/repos/[repoId]/` holds only `conventions/` and `pulls/`; `nav.ts:21-42` has no entry | **Intended** — new route + nav entry → R13 |
| Left rail header `.devdigest/specs/` (`24:111`) | Nothing; the pre-provisioned empty-state string also says "under .devdigest/specs/" (`client/messages/en/context.json:13`) | **Intended change, contradicts the mock** — documents are discovered repo-wide, not in one DevDigest-owned folder (Decision 1) → R1. That message string is rewritten. |
| New file / New folder / Upload buttons (`24:113-114`) | Nothing | **Intended removal** — DevDigest never writes into a user's clone → R1, Scope-out |
| Re-index button (`24:114`) | `POST /repos/:id/resync` exists with no UI on this screen (`repo-intel/routes.ts:43-65`) | **Intended change** — becomes **Rescan**, reusing that route rather than creating a document-only index → R9 |
| Footer "Indexed: 12 files · 1,240 chunks" (`24:120`) | The code index produces **no chunks for `.md`** — they never pass the walk filter (`pipeline/walk.ts:100-101`), so the number is unbuildable | **Intended change, confirmed 2026-08-18** — the footer reads **`N files · M tokens total`** plus the commit the list was read at. `chunks` is replaced by `tokens total`: a chunk count could not be produced, and a token total is the number the user is actually deciding against → R1, R3a |
| `Preview | Edit` toggle (`24:124-125`), and `mode.edit` / `editor.save` strings already in `client/messages/en/context.json:15-23` | Nothing rendered | **Intended change — Preview only.** Editing the clone is not merely out of scope, it is unsafe: `sync()` does `git reset --hard` (`adapters/git/simple-git.ts:86`) and would destroy the edit silently. Replaced by **Open on GitHub** → R2, D1. The `mode.edit` / `editor.*` keys stay unused |
| "Used by 3 agents" (`24:127`) | Nothing | **Intended, and made real** — derived from actual attachments, and click-through to the Agents tab → R2 |
| `COVERAGE 78` ring (`24:128`) | `CircularScore` exists in the UI kit; no coverage metric exists anywhere in the repo for a document | **Intended change** — replaced by the attachment count, "Used by N agents", which is a number this feature owns → R2, D2 |
| No Skills/Agents tabs anywhere | — | **Mockup oversight** — the mock predates Decision 2; tabs are required → R2 |
| No token counts anywhere | `skills_tokens` already exists per-slot in the trace (`contracts/trace.ts:61-67`) | **Mockup oversight** → R3 |
| Nothing about Prompt Assembly | `TraceBody.tsx:74-131` renders the `specs` slot today — always empty, since nothing populates it | **Mockup oversight** — attribution required → R5 |
| Empty state CTA "Add a spec file" (`24:105`) | — | **Intended change** — the CTA becomes Rescan / "how documents are discovered" → R9, C1 |

### UX improvements proposed

All `proposed`, none required.

- **Attachment-first list, not filename-first.** Show an attachment badge and
  token count on every row of the left rail, so the question the page exists to
  answer — *what is my agent actually reading?* — is answerable without opening
  six documents in turn. Serves R2/R3.
- **Show the agent's budget bar on the Agents tab, not just a warning.** A bar
  filling toward the 25 % line turns "you are over" into "you have room for
  about one more PRD", which is the decision the user is actually making.
  Serves R7.
- **Deep-link the trace back to the page.** From the Prompt Assembly attribution
  row, a link to that document on the Project Context page closes the loop
  between "this review cost 9 000 extra tokens" and "here is where to detach it".
  Serves R5. Prevents the common error of guessing which attachment is the
  expensive one.
- **Group the list by directory.** With basenames only (`24:118`), `README.md`
  appears N times identically. Prevents attaching the wrong document — a
  mis-attachment is silent, unlike most errors here.

## Module interaction

| From → to | Contract | Sync? | If the far side fails | Requirement |
| --- | --- | --- | --- | --- |
| `client` → `server` (list documents) | `GET /repos/:id/context` → `ProjectContextDoc[]` (widened from the unrouted `SpecFile`, `contracts/platform.ts:257-263`); already-written hook `useContextFiles` (`client/src/lib/hooks/core.ts:155-162`) | yes | Page renders the existing `loadError` string (`context.json:9`) with a retry; no partial list is shown as if complete | R1 · C6 |
| `client` → `server` (read one document) | `GET /repos/:id/context/*path` → document text + token count | yes | Body pane shows `editor.loadError` (`context.json:20`); the attachment tabs stay usable, since they do not depend on the body | R2 · C7 |
| `client` → `server` (attach / detach) | `PUT` of the attachment set for one document | yes | Toggle reverts with an inline error; no optimistic state is left claiming an attachment that did not persist | R2 · C9 |
| `client` → `server` (rescan) | existing `POST /repos/:id/resync` → `IndexStatus` (`contracts/platform.ts:265-270`); hook `useReindexContext` (`core.ts:164-169`) exists and points at a route that does not | yes (enqueue) | Button returns to idle with an error; the previously listed documents stay visible and are labelled as read at the older commit | R9 · C6 |
| `server` (reviews) → clone on disk | `git.readFile` (`server/src/adapters/git/simple-git.ts:129-131`); the working tree is kept after indexing | yes | A document that fails to read is skipped, logged, and listed in the trace as skipped — **the run proceeds**. Missing grounding degrades a review; a failed run helps nobody | R4 · R10 · C7 |
| `server` → `reviewer-core` | existing `ReviewInput.specs?: string[]` (`reviewer-core/src/review/run.ts:61`), fed at `run-executor.ts:254-280` | yes (in-process) | n/a — pure function | R4 |
| `reviewer-core` → `server` (trace) | `PromptAssembly.specs` + new `specs_used` / `specs_tokens` (`contracts/trace.ts:39-77`) | yes (in-process) | n/a | R5 |
| `mcp` → `server` | existing `POST /pulls/:id/review` (`mcp/src/api.ts:121-127`) | fire-and-forget | Unchanged — MCP already polls run status; attached context is invisible to it, which is why it needs no change | R12 |

## Contract changes

`@devdigest/shared` first (`server/src/vendor/shared/`), then mirrored to
`client/src/vendor/shared/` via `./scripts/check-shared.sh --fix`.

1. **`SpecFile` → `ProjectContextDoc`** (`contracts/platform.ts:257-263`). The
   placeholder has `path` / `content` / `size` / `updated_at`, all nullish. It
   needs, per document: token count, attachment counts (agents / skills), and a
   `missing` flag (R10). `content` stays out of the **list** response — a list
   endpoint that ships every document body would send megabytes to render a
   sidebar. Nothing consumes `SpecFile` today except the unrouted hook
   (`client/src/lib/hooks/core.ts:158`), so this is a rename, not a migration.
2. **Attachment shape.** A document-to-target link carrying `path`,
   target kind (`agent` | `skill`), target id, and order (the order R8 drops
   from). Symmetrical with `AgentSkillLink`, which already carries `order`
   (`specs/02-skills.md:140-141`).
3. **`PromptAssembly` gains `specs_used` and `specs_tokens`, and nothing else**
   (`contracts/trace.ts:39-77`). This is the explicit reconciliation with root
   `INSIGHTS.md:211-219` — *"Do not 'fix' this by adding a `diff` field to the
   contract: the trace already persists `user`, so a second copy would double
   the largest thing in the document."* The same reasoning applies here and
   points the same way: R5's full text is already persisted, because the
   existing `specs` slot holds the rendered block verbatim and the trace is one
   jsonb document (`server/src/db/schema/runs.ts:46-51`,
   `server/src/platform/trace-builder.ts:37-57`). So **no third copy**:
   `specs_used` is metadata only — path, sources, tokens per document — exactly
   mirroring `skills_used` / `skills_tokens` (`contracts/trace.ts:52-67`), which
   exist for the identical reason (one concatenated string, no way to attribute
   a paragraph to its origin). Both are nullish for traces written before they
   existed, and null — never 0 — when there is no `specs` slot.
4. **`RunTrace.specs_read`** (`contracts/trace.ts:110`) — shape unchanged
   (`string[]`); it stops being hard-coded `[]` (`run-executor.ts:382,614`).

## Corner cases

| ID | Case | Expected behaviour | Requirement |
| --- | --- | --- | --- |
| C1 | Repo imported, clone/index has not finished | Page shows an indexing state using the existing `indexStatus` string (`context.json:8`), not "No spec files yet" — the two are different facts and the mock's single empty state conflates them | R1 · R9 |
| C2 | Clone finished, repo genuinely contains zero `.md` files | Empty state explains *where DevDigest looked* (repo-wide, minus the excluded dirs) and offers Rescan. No "Add a spec file" CTA — there is nowhere to add one | R1 · R9 |
| C3 | 800 `.md` files, several sharing a basename | List is grouped/searchable and every row shows the full repo-relative path; discovery stops at 1 000 documents and the page states that the list was truncated and at what limit | R1 · NF-scale |
| C4 | An attached document is 700 KB (generated changelog) | It exceeds the 400 KB per-file ceiling the walk already applies (`repo-intel/constants.ts:43`): it is listed, shown as **too large to attach**, and the attach toggle is disabled with the limit named. It is never silently truncated into the prompt | R1 · R8 |
| C5 | Token counting for 800 documents on first page load | Counts are computed server-side and cached by content hash; a document whose count is not yet computed renders a skeleton, not a `0` | R3 · NF-latency |
| C6 | Rescan fails (git fetch times out / remote gone) | Rescan button returns to idle, an error names the failure, the previously listed documents remain visible and the footer states the commit they were read at. No document is dropped from the list because a fetch failed | R9 |
| C7 | An attached document is unreadable at run time (clone directory deleted from disk, permissions) | The run **continues** without it; the run log records `skipped <path>: unreadable`; the trace lists it under `specs_used` marked skipped with 0 tokens; the review is not marked failed | R4 · R10 |
| C8 | A rescan deletes the document the user currently has open | The body pane switches to a "no longer in the repository" state naming the path, keeps the Skills/Agents tabs usable (so the user can detach), and does not silently navigate away | R10 |
| C9 | Two browser tabs toggle the same attachment in opposite directions | Last write wins per document; the losing tab's list refetches on focus and shows the winning state. No merge, no lost-update dialog — the payload is one small set | R2 |
| C10 | User deep-links a document path that does not exist | Page loads the list normally and shows a "not found in this repo" state for the requested path, with the path shown. Back returns to the list, not out of the page | R13 |
| C11 | An agent attaches doc A directly, and links a skill that also attaches A | A appears once in the prompt, once in `specs_tokens`, once in the agent total, and its trace row lists both sources: `agent`, `skill:<name>` | R6 |
| C12 | Attached total is 42 % of the model window (over the 25 % cap) | Save succeeds with a warning naming both numbers. At run time the tail of the attachment order is dropped whole-document until the block fits; each drop is a run-log line and a skipped row in the trace. The review still runs | R7 · R8 |
| C13 | A document contains text like `</untrusted>`, or its path contains `"` | Content is escaped by the existing delimiter-stripping (`prompt.ts:32`); the path used as the `source="…"` label is sanitised so it cannot close the attribute or inject a second block | R11 |
| C14 | A globally disabled skill has documents attached | Its documents do **not** enter any agent's prompt, matching the hard-off rule for skills (`specs/02-skills.md:238`). The Project Context page shows the attachment as `disabled` rather than hiding it | R4 · R6 |
| C15 | A run is replayed against an older `agent_versions` snapshot, and an attached document has changed or been deleted since | The replay reads the documents **as they are now**, not as they were — attachments are not snapshotted (D3). The trace labels the project-context block `documents read at replay time, not pinned to this version`, so the run is never presented as byte-reproducible when it is not. Contrast `skills`, which *are* pinned (`specs/02-skills.md:118-134`) | R5 · D3 |

## Non-functional requirements

| Axis | Bound | Requirement | `n/a` because |
| --- | --- | --- | --- |
| Latency | Document list with per-document token counts returns in < 1 s p95 for a repo with up to 500 `.md` files; counts are cached by content hash so a repeat request re-tokenises nothing. Over budget, the list renders first and counts stream in as skeletons | R1 · R3 · C5 | |
| Scale | Discovery caps at 1 000 `.md` documents and 400 KB per document, mirroring the walk's existing `MAX_INDEXED_FILES` / `MAX_FILE_SIZE` (`repo-intel/constants.ts:42-44`). Past either cap the UI states the limit rather than silently listing a subset | R1 · C3 · C4 | |
| Cost | **Zero added LLM calls** — discovery, counting and injection are all deterministic. But every attached document adds input tokens to *every* run of that agent, which flows into `costUsd` from provider-reported usage (`adapters/llm/anthropic.ts:120-127`). The page must show the per-agent token total for exactly this reason, and label it an estimate: the counter is `cl100k_base` (`adapters/tokenizer/index.ts:14,31`), which is neither Anthropic's tokenizer nor current OpenAI models' `o200k_base`, so the displayed number will differ from what is billed | R3 · R7 | |
| Failure | Degraded, never hard: an unreadable document is skipped and the run proceeds (C7); a failed rescan leaves the last-known list visible (C6); a failed attachment write reverts the toggle (module-interaction table). The only hard stop is attaching a document over the size ceiling, and that is a save-time refusal with the limit named, not a run-time failure | R9 · R10 · C4 | |
| Security | Document content is **repo-authored, therefore untrusted** — it stays inside `wrapUntrusted` with the injection guard, unlike skills, which are the deliberate trusted-instruction exception (`specs/02-skills.md:90-107`). Only paths inside the clone root are ever read; symlinks are not followed (`pipeline/walk.ts:89`). No document text may enter the run log — `PromptSectionStat` is structurally incapable of holding it and must stay that way (`prompt-log.ts:6-11`) | R11 · C13 | |
| Accessibility | The Skills/Agents tabs are keyboard-reachable with arrow-key movement and roving focus; every attach toggle is a labelled control naming the document and target; the over-budget warning is announced, not colour-only | R2 · R7 | |
| i18n | Every new string is a `next-intl` key under `client/messages/en/context.json`, which already exists (`:1-24`). The `.devdigest/specs/` sentence at `:13` is rewritten (R1); `mode.edit` and `editor.*` (`:15-23`) go unused rather than being wired | R13 | |
| Observability | After a run, the trace answers without guessing: which documents were injected, from which attachment source, at what token cost, and which were skipped or dropped and why — via `specs_used`, `specs_tokens`, `specs_read` and run-log lines, tied together by the existing `correlation_id` (`contracts/trace.ts:68-73`) | R5 · R8 · R10 | |

## Acceptance criteria

| ID | Criterion — checkable from outside | Requirement | Verify by |
| --- | --- | --- | --- |
| A1 | `GET /repos/:id/context` on a repo whose clone contains `README.md`, `docs/a.md` and `node_modules/x/b.md` returns exactly the first two, with full repo-relative paths | R1 | server `*.it.test.ts` |
| A2 | Attaching `docs/a.md` to agent X, then `GET`ing the document, returns agent X in its Agents tab payload; detaching removes it | R2 | server `*.it.test.ts` · client test |
| A3 | The token count returned for a document equals `container.tokenizer.count` of its exact file content — asserted against the same counter, not a re-implementation | R3 | server hermetic test |
| A3a | The page total and the run agree, and the page says so when they cannot. For an agent whose attachments exceed the cap: the over-cap document renders struck through with its reason, the agent's displayed total equals the sum the run injects (excluding it), and `specs_tokens` in the trace equals that displayed total. The left-rail footer's `M tokens total` equals `tokenizer.count` summed over **all discovered** documents and is labelled as a ceiling, not a current cost. | R3a · D4 | server hermetic test for the totals + client test for the two labels |
| A4 | A review run for an agent with `docs/a.md` attached produces a prompt whose user message contains `## Project context` and the document's text; the same agent with nothing attached produces a user message byte-identical to the pre-feature baseline | R4 | `reviewer-core` hermetic test · server `*.it.test.ts` |
| A5 | `GET /runs/:id/trace` for that run returns `specs_used` containing `docs/a.md` with its source and token count, `specs_tokens` > 0, `specs_read` containing `docs/a.md`, and `prompt_assembly.specs` containing the document text — and `PromptAssembly` still has **no** field holding a second copy of the diff or of the document text outside `specs`/`user` | R5 | server `*.it.test.ts` · contract test |
| A6 | The Run Trace drawer's Prompt Assembly section lists the attached document paths and opens the full injected text in the fullscreen viewer | R5 | client test · `e2e/specs/` flow |
| A7 | For an agent attached to `docs/a.md` that also links a skill attached to `docs/a.md`, the assembled prompt contains the document's text exactly once, `specs_tokens` counts it once, and its trace row lists both sources | R6 | server `*.it.test.ts` |
| A8 | With attachments summing over 25 % of the resolved window, the Agents tab shows the warning naming the total and the limit, and the attachment still saves and returns 200 | R7 | client test · server `*.it.test.ts` |
| A9 | With attachments over the cap, the run's assembled `specs` block is under the cap, the dropped document is absent from `prompt_assembly.specs`, present in `specs_used` marked dropped, and named in a run-log line; the run completes | R8 | server `*.it.test.ts` |
| A10 | Clicking Rescan issues `POST /repos/:id/resync` and, after it completes, the list reflects a `.md` added to the clone since the previous scan | R9 | client test · `e2e/specs/` flow |
| A11 | Deleting an attached `.md` from the clone and rescanning: the document shows as missing on the page and on its agent, the attachment still exists, its token contribution is 0, and a subsequent run completes with a skip line in the log and no crash | R10 | server `*.it.test.ts` |
| A12 | A document containing the literal `</untrusted>` and one at a path containing a `"` are both injected without breaking the block: the assembled prompt has exactly one `<untrusted source="…">` open/close pair per document, and each `source` attribute is the document's path | R11 | `reviewer-core` hermetic test |
| A13 | Starting a run through the MCP `run_agent` tool for an agent with attachments yields a trace whose `specs_read` equals the one produced by the web app for the same agent and PR, with no change under `mcp/src/tools/` | R12 | manual click + `GET /runs/:id/trace` diff · `mcp` test |
| A14 | `/repos/:repoId/context` renders, the sidebar entry is active on it, and no user-facing string on the page is a literal in JSX (all resolve from `messages/en/context.json`) | R13 | client test · `e2e/specs/` flow |

## Traps

- **The `specs` slot already exists and is already labelled — do not add a new
  one.** `prompt.ts:135-137,164`, `contracts/trace.ts:42`, `prompt-log.ts:51,64`
  and `TraceBody.tsx` all handle it today. The missing piece is one argument at
  the `reviewPullRequest` call site (`run-executor.ts:254-280`). A parallel
  "project context" slot would produce two blocks that disagree.
- **`prompt-log.ts` must stay text-free.** Its header
  (`prompt-log.ts:6-11`) says a `sample`/`preview` field "would defeat the whole
  file — don't". R5's full text is served from the persisted trace, never the
  log.
- **The trace already stores the block twice** — once in `prompt_assembly.specs`
  and once inside `prompt_assembly.user` — because `user` is the whole rendered
  message. That is pre-existing and true of skills too, but it means every
  attached kilobyte costs two kilobytes of `run_traces.trace` jsonb per run
  (`server/src/db/schema/runs.ts:46-51`). It is a reason the R8 cap exists; it is
  not a reason to remove the `specs` slot.
- **`ModelInfo.contextLength` is defined but never populated.** Both
  `listModels` implementations omit it (`adapters/llm/anthropic.ts:92-101`,
  `adapters/llm/openai.ts:69-76`). Code that reads it directly will compute a
  percentage of `null` and warn about nothing. R7's fallback chain is not
  optional.
- **`repo-intel` does not see `.md` at all.** `SUPPORTED_EXT`
  (`repo-intel/constants.ts:14`) has six JS/TS extensions and the walk `continue`s
  on everything else (`pipeline/walk.ts:100-101`). There is no existing table, row
  or chunk for a markdown file to build on — but the clone's working tree is kept
  and readable (`adapters/git/simple-git.ts:129-131`), which is what makes
  read-on-demand viable.
- **`.gitignore` is not honoured by the walk** (`pipeline/walk.ts:14-19`, TODO).
  A repo with generated markdown in an ignored directory will list it.
- **`specs/02-skills.md:178-184` is stale** where it says `run-executor` has
  `skills: null`; that wire was reconnected (`run-executor.ts:246-248`). Read the
  code, not that paragraph, when copying the skills pattern.
- **`client/messages/en/context.json` already exists** and describes a different
  product (a `.devdigest/specs/` folder you edit). Reusing its keys unchanged
  would ship copy that contradicts Decision 1.

## Decisions taken after review — do not re-open

Answered by the CTO 2026-08-18, in review of this spec's first draft. They close
what were Q1, Q2 and Q4.

### D1 — The document surface is view-only, and that is a constraint, not a preference

Editing a document in place was considered and **rejected on evidence**: the
clone is a read-only mirror by construction. `sync()` ends in
`git reset --hard origin/<branch>` (`server/src/adapters/git/simple-git.ts:86`,
whose own comment calls it "the read-only mirror"), and `clone()` deletes the
destination outright when it already exists (`simple-git.ts:64`). Any edit a
user made would survive only until the next resync and would then vanish with no
event, no warning and no recovery — the worst shape a data-loss bug can take.

Making editing real would mean write, commit and push back to the user's GitHub
repository: a token with write scope, a branch-or-PR decision, conflict handling
and a permission model. That is a separate feature, not a detail of this one.
So: **rendered read-only, with "Open on GitHub" at the document's path on the
default branch** as the way out to an editor. `client/messages/en/context.json`
already carries `mode.edit` and `editor.*` keys; they stay unused rather than
being wired to something that would lose work.

### D2 — The `COVERAGE` ring is replaced by the attachment count

The mock's `COVERAGE 78` (`24:128`) has no data source anywhere in the
repository and would have to be invented. It is replaced by the number this
feature actually knows: **how many agents use this document**, counting the
deduplicated union of direct and skill-mediated attachments (R6). One click
opens the Agents tab filtered to them. A fabricated score on a grounding surface
is worse than a blank corner.

### D3 — Attachments are not pinned into agent version snapshots

Take the smallest implementation. Attaching or detaching a document does **not**
create a new `agent_versions` row and documents are not snapshotted into one.
The honest record of what a run read is "these paths, with this content, at this
commit", which the trace already carries (R5). Pinning would require storing
document bodies inside version snapshots, and this feature does not need
replay-identical documents.

Consequence to hold: replaying an old agent version replays **today's**
documents, not the ones that ran. Say so in the trace rather than implying
otherwise — see C15.

### D4 — The footer counts tokens, not chunks

Confirmed by the CTO 2026-08-18. The mock's `1,240 chunks` (`24:120`) is not a
number this repository can produce — `.md` never enters the code index, so no
chunk for a document exists (`pipeline/walk.ts:100-101`). It is replaced by
**`N files · M tokens total`**.

The substitution is not cosmetic. The question the page exists to answer is
*how much will attaching this cost me at review time*, so the unit on screen
should be the unit that is spent. R3a exists to keep that promise honest: the
page shows post-dedup, post-cap numbers, and the footer's total is explicitly
the ceiling if everything were attached — not a current cost.

## Open questions

| ID | Question | My proposed default | Blocks |
| --- | --- | --- | --- |
| Q1 | Is the 25 % window fraction (R7/R8) right, and should the skills block and the project-context block share one budget or hold separate ones? | **25 %, separate budgets.** `specs/02-skills.md:186-200` already gives skills their own char cap; one shared budget would make an unrelated skill edit silently drop a PRD. Revisit against real traces | R7 · R8 |
| Q2 | Should the discovered set be `.md` strictly, or also `.mdx` / `.markdown`? | **`.md` and `.markdown` only.** `.mdx` is code-bearing and would need a different renderer | R1 |
| Q3 | Attachment lives on the document (Decision 2). Should the Agents list also surface a read-only "N documents attached" badge so an agent's cost is visible where the agent is configured? | **Yes, read-only badge, no controls** — it answers "why is this agent expensive" without reopening the Context-tab decision | nothing |

## Could not establish

- **What the real token distribution of `.md` in a user repo looks like.** Every
  scale number here (1 000 documents, 400 KB, 25 %) is derived from the limits
  `repo-intel` already applies to source files
  (`repo-intel/constants.ts:42-44`), not from a measured corpus of markdown.
  Q3 exists because of this.
- **How far `cl100k_base` drifts from what Anthropic and OpenAI actually bill.**
  The adapter is unambiguous about the encoding it uses
  (`adapters/tokenizer/index.ts:31`) and no `docs/` or `INSIGHTS.md` entry
  addresses billing accuracy. The spec therefore requires the count be *labelled*
  an estimate rather than pinning an error bar it cannot justify.
- **Whether `repos.defaultBranch` is ever populated from GitHub's actual default
  branch** or stays at the schema default `'main'`
  (`server/src/db/schema/repos.ts:15`). It matters for R9 only in that a rescan
  on a repo whose default branch is not `main` may fetch the wrong ref — an
  existing condition of `resyncRepo` (`repo-intel/service.ts:144-163`), not one
  this feature introduces.
- **Whether `client/src/vendor/shared/contracts/trace.ts` is currently in sync
  with the server copy.** The lines cited match, but `./scripts/check-shared.sh`
  was not run, and root `INSIGHTS.md:337-352` records that this vendor pair has
  drifted before.
