# Insights — server

Server-side decisions and dead ends. Read before redesigning anything here; a
lot of what looks arbitrary was a deliberate trade-off.

Read at the start of a task, written at the end of one, by the
`engineering-insights` skill. Sections are fixed — add to the one that fits,
newest first. If it would be obvious to anyone reading the code, leave it out.

Formats — `Decisions` takes prose; every other section takes a dated bullet:

```markdown
### YYYY-MM-DD — <short title>

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what we tried or considered, and how it failed.
```

```markdown
- **YYYY-MM-DD** — <the claim, specific enough to act on cold>.
  `src/path/to/file.ts:42`
```

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here. Insights about `src/vendor/shared/` go in the **root** `INSIGHTS.md` —
a contract change reaches every package.

---

## Decisions

### 2026-08-10 — Token counting for the run trace is unconditional; only the verbose LOG stays gated

**What:** `run-executor.ts` now always passes a `countTokens` fn into
`describePromptSections`, so every populated prompt section — including
`skills` — gets a `tokens` figure on every run, not just when
`config.promptLogVerbose` is on. `config.promptLogVerbose` still gates only the
per-section `runLog.info(formatSectionLine(...))` lines (`run-executor.ts:294-313`).
The `skills` figure is copied onto the persisted trace as
`prompt_assembly.skills_tokens` (`trace.ts:PromptAssembly`), which is what
closed `specs/02-skills.md` acceptance #4 — the Run Trace's `skills` slot
attributing a token count, not just showing a non-null block.
**Why:** the Run Trace needs a real count on every run to answer "how many
tokens did the skills block cost", and `prompt-log.ts`'s own doc comment says
tokens are "only populated in verbose mode (tokenising every section is not
free)" — that comment now describes the LOG's behaviour, not the counting
function's, so do not re-read it as still gating `describePromptSections`
itself; the function always tokenises whatever `countTokens` you hand it.
**Rejected:** a second, cheaper token estimator just for the trace field. The
repo has exactly one counter (`this.container.tokenizer.count`, wired through
`describePromptSections`) and duplicating it would mean two token numbers that
can silently disagree.

### 2026-08-09 — Skill trust follows `source`, and extraction is trusted

**What:** the assembler wraps a skill body in `<untrusted>` when its `source` is
`imported_url` or `community`, and leaves `manual` and `extracted` raw
(`src/modules/skills/constants.ts:UNTRUSTED_SKILL_SOURCES`,
`assembler.ts:bodyFor`).
**Why:** skills are the one prompt block joined in unwrapped, which is only
correct while they are author-written (`specs/02-skills.md`, *Security*). An
imported document is data written by someone outside the workspace. An
*extracted* one is not: the model only proposed it, the evidence was verified in
code, and a maintainer accepted it by hand before it became a skill — wrapping it
would tell the model to disregard rules its own user just approved.
**Rejected:** wrapping at import time, inside the stored body. It looks simpler
and is worse: the marker is then editable text a user can delete without knowing
what it was for, and the same body would be double-wrapped if the boundary ever
moved back to assembly.

### 2026-07-31 — Schema-first validation at the route boundary

**What:** every route declares Zod `params`/`body`/response schemas from
`@devdigest/shared` via `fastify-type-provider-zod`; invalid input is rejected
with `422` before the handler runs.
**Why:** one definition has to drive both request validation and response
serialization, or the two drift.
**Rejected:** hand-rolled `Schema.parse(req.body)` inside each handler — it
validated input only, left responses unchecked, and duplicated the schema
reference in every route.

## What Works

- **2026-08-09** — Grounding an LLM extraction is two code steps around the
  model, not a better prompt. The conventions extractor sends the sampled files
  **line-numbered** (`renderNumberedFile`) so the model can cite a number it can
  see, then verifies every candidate against the file it named: path must be in
  the sampled set, snippet must occur in that file with whitespace normalised
  (models re-indent what they quote), and the **line number is corrected rather
  than trusted** — the snippet is the claim, the number is a pointer, and a
  candidate dropped over an off-by-four is a real rule lost. Only the counts of
  proposed/verified/dropped are returned, which makes the extraction's precision
  visible instead of folded into the results. `src/modules/conventions/helpers.ts:118`
- **2026-08-09** — A drizzle-kit `generate` that both adds and drops columns on
  one table prompts interactively ("created or renamed from another column?") and
  **cannot be driven from a non-TTY shell** — piping newlines does nothing and a
  pty via `script` hangs. Split it into two generates instead: keep the doomed
  column in the schema for the additive pass, then remove it for a drop-only
  pass. Two migration files, zero prompts, and each one says what it does
  (`0012` adds the conventions columns, `0013` drops the legacy `accepted`).
  `src/db/migrations/0013_fancy_skin.sql:1`

- **2026-08-09** — Agent-version replay only pins skill **text** because
  `snapshotVersion` now records `{id, version}` refs
  (`skillRefsForAgent`) instead of the bare ids `skillIdsForAgent` returned. Rows
  written before that change read back through `SkillRefTolerant` as
  `version: null`, and the assembler deliberately falls back to the skill's
  *current* body for them — that is the honest reading of "we never recorded
  which text this ran with". Never backfill those nulls; it would invent history.
  A pinned ref whose skill or snapshot is gone is omitted with a note in the run
  log, not thrown, so a deleted skill costs one rule and not the whole review.
  `src/modules/agents/repository.ts:180` · `src/modules/skills/assembler.ts:116`
- **2026-08-09** — To write a rollback test that can actually fail, make the
  **second** write in the transaction violate a constraint, not the first.
  `skills.it.test.ts` pre-inserts a `skill_versions` row at `(skill_id, 2)`, then
  PUTs a body change: the `skills` UPDATE has already run when the snapshot
  insert hits the composite PK, so without the transaction the row is left at
  version 2 with a body no snapshot describes. Verified the only way that means
  anything — the transaction was temporarily replaced with a plain IIFE over
  `this.db` and the test was watched to fail with `expected 2 to be 1`. Note this
  only works because `insertVersion` deliberately does **not** use
  `.onConflictDoNothing()`; `agents/repository.ts:195` does, which would swallow
  the conflict and leave the snapshot silently missing.
  `test/skills.it.test.ts:174`

## What Doesn't Work

- **2026-08-13** — **The seeded demo repo cannot exercise `repo-intel` at all**,
  so no amount of `pnpm test` verifies a feature built on it. `acme/payments-api`
  is inserted by `db/seed.ts` with no `clone_path` and is never cloned, and every
  facade read starts with `getRepoBasics(repoId)` → no clone → the degraded
  empty result. The seeded PR therefore returns "index unavailable" from
  `GET /pulls/:id/blast` forever, and `e2e` flow `09` can only assert the
  *degraded* copy. 283 green server tests said nothing about whether blast radius
  worked; the first real answer came from `curl`-ing an imported repo that had
  actually been indexed (`AIengineerDev/dev-digest`, `repo_index_state` populated)
  — which is also where the flat-slice caller-cap bug below surfaced. Verify any
  repo-intel-backed feature against a real imported+indexed repo before calling
  it done, and never read a passing suite as coverage of the indexed path.
  `src/db/seed.ts` · `src/modules/repo-intel/service.ts:220`

## Codebase Patterns

- **2026-08-26** — When a cache table's primary key includes a value expected
  to drift out from under a READ (here: `onboarding_tours`'s key includes
  `indexed_sha`/`indexer_version`, and a resync changes them), the write path's
  cache-check and the read path's lookup need DIFFERENT keys, not the same one
  loosened everywhere. `TourService.generate()`'s cache-hit check still uses
  the full 6-column `findByKey` — a stale sha there is correctly a cache miss,
  triggering regeneration. `TourService.get()` instead calls a new
  `findLatestForRepo(repoId, promptVersion, provider, model)` — deliberately
  omitting `indexedSha`/`indexerVersion` — so a re-index doesn't make the
  previously-generated row invisible to a plain page view; the response then
  carries both the row's own `indexed_sha` and a freshly-fetched
  `current_indexed_sha` so the client can render a "stale" banner instead of
  silently regenerating. Generalizes to any R12-shaped cache key: the row that
  answers "what do we have" is not always the row `onConflictDoUpdate` targets.
  `src/modules/tour/repository.ts` (`findLatestForRepo`) ·
  `src/modules/tour/service.ts` (`get`)

- **2026-08-18** — `RepoIntelService.getIndexState(repoId).lastIndexedSha` is
  `''` (empty string), never `null`, for a repo that has no `repo_index_state`
  row (the seeded demo's permanent state, `server/INSIGHTS.md`, 2026-08-13) —
  the facade synthesises a degraded `IndexState` literal rather than making the
  field optional. A caller that needs "never indexed" to mean SQL NULL (e.g. a
  cache key with a nullable column plus a `COALESCE`d unique index, like
  `pr_brief_records`) must map it itself: `indexState.lastIndexedSha || null`.
  Storing the facade's `''` verbatim works today but reads as a real (if odd)
  sha string instead of "no index", and silently drifts from a schema that was
  deliberately built to distinguish the two.
  `src/modules/repo-intel/service.ts:190-206` · `src/modules/brief/service.ts:107`

- **2026-08-19** — When a plan requires a hermetic unit test for an assembler-shaped
  class that reads one DB table (mirroring `SkillAssembler`'s
  `constructor(db: Db)`), do not copy that constructor shape verbatim — it can
  only be tested via `*.it.test.ts` + Postgres, which is what `SkillAssembler`'s
  own only test (`test/skills-assembly.it.test.ts`) does. `ProjectContextAssembler`
  instead takes an injected `AttachmentSource` interface (the narrow read it
  needs), not a raw `Db` it builds its own repository from; the container still
  wires the real `ProjectContextRepository`, but `test/project-context/
  assembler.test.ts` passes an in-memory stub and needs no Docker. The dedup
  (C11), tail-drop (C12) and disabled-skill (C14) cases in
  `specs/09-project-context.md` all needed this to stay in the fast lane.
  `src/modules/project-context/assembler.ts:26` (`AttachmentSource`)
- **2026-08-09** — A `RunLogger` fanned over an EMPTY `runIds` array is a valid,
  reusable "best-effort logger with no run" — `event()`/`info()`/`step()` just
  iterate zero SSE targets and skip straight to the stdout mirror. `POST
  /pulls/:id/intent` uses `new RunLogger(container.runBus, [], req.log, {...})`
  to get the same logging surface `IntentService.derive()` uses when fanned over
  active runs from `run-executor.ts`, without a bespoke logger interface for the
  standalone-call case. `src/modules/reviews/routes.ts` (POST /pulls/:id/intent).
- **2026-08-09** — A helper that every feature needs but one module happened to
  own belongs in `modules/_shared/`, not where it was written. `resolveFeatureModel`
  lived in `modules/settings/` and the second consumer (conventions) tripped
  `no-cross-module-internals` immediately; it moved to
  `modules/_shared/feature-models.ts`, which the rule exempts as a target. Moving
  it meant dropping its one import back into `settings` (`rowsToSettings`, four
  lines) and inlining that fold — `_shared` → `modules/settings/*` is the same
  violation in the other direction. `src/modules/_shared/feature-models.ts:1`

- **2026-08-09** — To use one module's logic from another (here: the review run
  executor needing the skills module's `enabled` filter and assembly budget),
  build a small class that takes **`Db`, never `Container`**, expose it as a
  getter on `platform/container.ts`, and consume it as `this.container.skills.…`
  with the type inferred. Both obvious alternatives are blocked: a direct
  `modules/reviews/*` → `modules/skills/*` import trips `no-cross-module-internals`
  (even `import type`, because `tsPreCompilationDeps: true`), and putting the
  logic on the module's `service.ts` — which takes `Container` for DI — makes the
  container getter a **new** import cycle, unprotected by the 5 baselined ones.
  Inference is what keeps it clean: the executor never names the class, so no
  cross-module edge exists in the graph at all. The precedent it copies is
  `container.agentsRepo`, consumed as `Container['agentsRepo']`.
  `src/platform/container.ts:111` · `src/modules/skills/assembler.ts:50`
- **2026-08-09** — Do not copy `agents/helpers.ts`'s row types into a new module.
  It imports `AgentRow` from `./repository.js`, which imports helpers back — one
  of the 5 baselined `pnpm arch` cycles, invisible only because `--ignore-known`
  hides it. A new module gets no such amnesty, and the obvious escape (importing
  the row type from `src/db/rows.ts`) is blocked by the `helpers-are-pure` rule,
  which forbids `src/modules/**/helpers.ts` → `src/(db|adapters)/` — and
  `tsPreCompilationDeps: true` means a `import type` still counts. The way out
  used by `skills` is to declare the columns structurally in `helpers.ts`
  (`SkillRowLike`) and let the service pass the real Drizzle row in; structural
  typing checks the two agree at the call site.
  `src/modules/skills/helpers.ts:14`
- **2026-08-09** — There is **no transaction anywhere in the server**:
  `grep -rn "\.transaction(" src` returns nothing, while `repo-intel/repository.ts`
  issues 19 write statements, `agents/repository.ts` 8, `reviews/repository/run.repo.ts`
  7 and `pulls/routes.ts` 7. So every multi-write invariant is currently
  best-effort. Two are reachable from normal use: creating an agent writes
  `agents` then `agent_versions` (an interrupted request leaves an agent with no
  initial version), and `GET /pulls/:id` **deletes** all `pr_files`/`pr_commits`
  before re-inserting them — a crash between the two leaves the PR with no files
  at all, which reads as "the diff vanished", not as a crash. Do not assume any
  existing repository method is atomic because it looks like one call; Drizzle's
  `tx` has the same shape as `db`, so the fix is to pass it in, not to restructure
  the repository. `src/modules/pulls/routes.ts:232`
- **2026-08-09** — Everything under `src/adapters/` looks alike from the folder
  name, but it is two different things and the architecture rules treat them
  differently. **Port-backed** adapters (`github`, `git/simple-git`, `llm`,
  `embedder`, `secrets`, `auth`, `codeindex/ripgrep`) implement an interface
  declared in `@devdigest/shared`, are constructed **only** in
  `platform/container.ts`, and are what `adapters/mocks.ts` swaps in tests —
  importing their concrete class anywhere else re-couples the core to the edge
  and silently defeats `ContainerOverrides`. **Stateless helpers**
  (`astgrep`, `tokenizer`, `git/diff-parser`, `codeindex/extract`) have no
  credentials and no network, are imported directly all over `repo-intel`, and
  that is correct — a test just calls them. `pnpm arch` enforces exactly this
  split, so the test for a new adapter is "would a test ever want to swap it
  out?", not "does it live in adapters/". `src/adapters/index.ts:1`
- **2026-08-09** — 5 of the baseline `pnpm arch` violations are import cycles,
  and nearly all run through the composition root: `platform/container.ts`
  imports concrete module classes (`AgentsRepository`, `ReviewRepository`,
  `RepoIntelService` at `container.ts:26-29`) while those modules import
  `type { Container }` back for constructor injection
  (`modules/repo-intel/service.ts:21,104`). The type-only import is erased at
  runtime, so nothing actually breaks — but `tsPreCompilationDeps: true` makes
  dependency-cruiser see it, and it will keep reporting until the container
  depends on interfaces rather than on the classes it happens to build. Do not
  "fix" it by dropping `tsPreCompilationDeps`; that would blind every other rule
  to type-only imports, which is where most layering violations hide.
  `src/platform/container.ts:26`
- **2026-08-07** — PR freshness is a side effect of two GET routes, not of any
  sync job: `GET /repos/:id/pulls` upserts `head_sha` for every PR from GitHub
  (`src/modules/pulls/routes.ts:66`), and `GET /pulls/:id` **deletes and
  re-inserts** all of `pr_files` and `pr_commits` from the detail fetch
  (`routes.ts:232`). `POST /repos/:id/poll` does the same as the former and
  nothing more. So a review triggered from a page the user has open reviews
  current code, and "stale findings" complaints are about *display*, not about
  fetching — but a review triggered without ever loading those pages (CI, a
  direct `POST /pulls/:id/review`) runs against whatever the last visit
  persisted. If you ever need a guaranteed-fresh review, refresh the pull inside
  `runReview`; do not assume the poller did it. `src/modules/pulls/routes.ts:232`
- **2026-08-07** — `loadDiff` has two non-equivalent sources and used to pick
  between them silently. The git path needs the PR head present in the clone, but
  clones are shallow and track the default branch, so `git diff base...head`
  routinely throws `bad object` and the `pr_files` reconstruction (GitHub's
  patches, which truncate on large files and are absent on binaries) is what the
  reviewer actually sees. A clone that is missing the head can also return an
  EMPTY diff instead of throwing — that is treated as a miss too, otherwise the
  agent reviews zero files and reports the PR clean. Both facts are now in the
  run log; keep them there. `src/modules/reviews/diff-loader.ts:26`

- **2026-08-05** — Per-PR aggregates on `GET /repos/:id/pulls` all use one fixed
  shape: a single `inArray(prIds)` query ordered `desc(createdAt|ranAt)`, then
  first-seen-per-PR wins in a JS `Map`. No correlated subquery, no window
  function, no per-row query. The COST column was added by copying the
  latest-review-score block verbatim — match it for the next such column instead
  of inventing a `DISTINCT ON`. The filter that carries the semantics is
  `status='done'`: it makes the value the latest **completed** run's cost, so a
  later failed run cannot blank out the last good figure, and it is a latest, not
  a `SUM` — a re-run replaces the number rather than adding to it. The same
  first-seen-wins step also collapses **agents**: a PR reviewed by Security and
  Performance in one pass produces two `agent_runs` rows, and the column shows
  only the more recent one's cost, not their sum. That is a product choice, not
  an oversight — change it only deliberately, and per-PR totals would need a
  `SUM` grouped by PR plus a rule for which pass counts as "the last".
  `src/modules/pulls/routes.ts:141`


## Tool & Library Notes

- **2026-08-19** — A pre-flight token gate that counts only the prompt strings
  **undercounts what the provider bills by the structured-output schema**, and
  the gap is not small. Measured on the first real PR Brief generation
  (`pr_brief_records`, PR #482, 4 changed files): our gate measured **612**
  tokens over `system + user`; Anthropic billed `usage.input_tokens` = **2006**.
  The 1 394-token difference is the tool/JSON-schema envelope `completeStructured`
  adds, which never appears in either string, so no amount of care in
  `assembleBriefInput` can see it. Consequence for any budget expressed as an
  acceptance criterion: an input measuring 7 900 against an 8 000 ceiling passes
  the gate and is billed ~9 300. The gate is still worth having — it is the only
  bound available *before* spending — but it must either count a serialized copy
  of the response schema alongside the strings, or the ceiling must be set with
  an explicit envelope allowance and named as such. Do not compare a local
  `tokenizer.count` to a provider ceiling without measuring the envelope first;
  persisting both numbers (`budget_tokens` and `tokens_in` on the record) is what
  made this visible in one query. `server/src/modules/brief/service.ts` ·
  `server/src/modules/brief/assemble.ts`

  **2026-08-26 — measured, and the two fixes above are not alternatives.** The
  serialized `Brief` JSON schema is 1 950 characters = **456** `cl100k_base`
  tokens — only a third of the 1 394-token gap. Counting it removes the part
  that is structurally invisible; the remaining ~940 is the provider tokenizing
  with its own encoder (not `cl100k_base`) plus the framing it wraps the tool
  block in, and **nothing in-process can see that**. So a gate that counts the
  schema and stops is still unsound, just less so. What shipped does both:
  `assembleBriefInput` counts `system + user + briefSchemaEnvelope()` and scales
  by a named `BRIEF_BILLING_SAFETY_FACTOR` that rounds the measured ratio
  (2 006 ÷ 1 068 ≈ 1.88) **up** to 2. Derive the counted envelope from the same
  Zod schema, `schemaName` and `toJsonSchema` the adapter serializes, never a
  literal — otherwise a schema edit moves the billed envelope and not the
  counted one. `server/src/modules/brief/assemble.ts:299` ·
  `server/src/modules/brief/constants.ts:33` · `specs/10-pr-brief.md` A-3

- **2026-08-18** — A Drizzle `onConflictDoUpdate({ target: [...] })` cannot
  target a **partial/expression unique index** — only a plain-column
  constraint. `pr_brief_records_state_uq` is
  `UNIQUE (pr_id, head_sha, COALESCE(intent_fingerprint,''), COALESCE(repo_indexed_sha,''), prompt_version, provider, model)`
  (needed because two of those columns are legitimately nullable and Postgres
  rejects NULL in a plain unique index the way `repo_map_cache`'s composite PK
  uses). Passing `target: [t.prBriefRecords.prId, t.prBriefRecords.headSha, …]`
  would generate `ON CONFLICT (pr_id, head_sha, …)`, which does not match this
  constraint at all and Postgres rejects at runtime. The workaround —
  `BriefRepository.upsert`, select-by-key then `update`-by-id or `insert` — is
  not atomic against a genuine race, which is fine here (`server/INSIGHTS.md`,
  2026-08-09, "nothing here is atomic") but is the reason ANY future
  `COALESCE`-based unique index needs the same select-then-write shape, not a
  native upsert. `src/modules/brief/repository.ts:100-127`
- **2026-08-19** — `MockGitClient.readFile` (`src/adapters/mocks.ts:293-295`)
  never throws — an unknown path degrades to `''`, unlike the real
  `SimpleGitClient.readFile` (a bare `fs.readFile`, ENOENT on a missing file).
  A test asserting a "document unreadable / missing on disk" code path (e.g.
  specs/09-project-context.md R10, C7) against the base mock silently exercises
  the *empty-content* branch instead, not the *catch* branch — both return, so
  nothing fails, but the wrong line ran. Use a small subclass overriding
  `readFile` to throw for unknown paths (see
  `test/project-context/attachments.it.test.ts`'s `ThrowsOnMissingGitClient`,
  or `test/project-context/assembler.test.ts`'s throwing stub) when the
  assertion is specifically about the unreadable path, not the found-but-empty one.

- **2026-08-10** — `text('col', { enum: [...] })` in Drizzle is a **TypeScript-only**
  union over a plain Postgres `text` column — `\d skills` shows no check
  constraint and no PG enum type. Adding a value (`'imported_file'` to
  `source`) therefore needs **no migration**: edit the array, edit the matching
  `z.enum` in `@devdigest/shared`, and `drizzle-kit generate` correctly reports
  "No schema changes". Nothing enforces that the two lists agree, so widening
  only one silently produces rows the API cannot serialize.
  `src/db/schema/skills.ts:13`

- **2026-08-05** — The `cost_usd` backfill in migration `0010` embeds a verbatim
  price snapshot copied out of `src/adapters/llm/pricing.ts`, and that
  duplication is deliberate — do **not** "DRY it up" or refresh it when prices
  change. The migration reprices only rows that predate cost persistence;
  re-running it against current prices would silently rewrite history. Runs
  created afterwards get the provider's real billed figure, never this table.
  Models missing from the list stay `NULL` on purpose (renders as "—", not
  `$0.00`). `src/db/migrations/0010_modern_professor_monster.sql:3`


## Recurring Errors & Fixes

- **2026-08-28** — `pr_files.patch` stores the **hunk body only** — it starts at
  `@@`, with no `diff --git` and no `+++ b/<path>` line. `parseUnifiedDiff` takes
  a file's path from that `+++` line and drops files whose path it cannot
  resolve, so a headerless patch parses to **zero files**, the grounding gate
  then finds nothing to match against, and every finding is dropped. The symptom
  is silent and total: `citation_accuracy 0`, `recall 0`, on any agent, with no
  error logged anywhere and a case that can never pass. Anything feeding a
  stored patch back into the engine must wrap it first —
  `toUnifiedDiff(path, patch)` does, and is idempotent. Seven `eval_cases` rows
  had to be repaired in place after this shipped.
  `src/modules/eval/helpers.ts` (`toUnifiedDiff`) ·
  `src/adapters/git/diff-parser.ts:40`

- **2026-08-26** — A `Write`/`Edit` tool call can silently insert a literal NUL
  byte (`\x00`) where a plain space was intended inside a template-literal
  expression (e.g. `` `${a} ${b}` `` landing on disk as `` `${a}\x00${b}` ``).
  `tsc` does not flag it — a `\x00` is a legal character inside a template
  string — and a loosely-worded test can pass anyway: `buildDiagram`'s edge-pair
  key used this pattern, `pair.split(' ')` silently returned the whole
  undelimited string as one element, both `ids.get()` lookups resolved to
  `undefined`, and the only assertion at the time (`.toContain('-->')`) was
  satisfied by the resulting `"undefined --> undefined"` line. Caught only by
  scanning the file for `\x00` (`python3 -c "b'\x00' in open(path,'rb').read()"`,
  or `file <path>` reporting `data` instead of `ASCII/Unicode text`) and by
  tightening the assertion to check for real node labels and the absence of the
  literal string `"undefined"`. When a template-literal join produces a
  surprising result and the source LOOKS correct, check for this before
  assuming the logic is wrong. `src/modules/tour/derive/diagram.ts:43`

- **2026-08-19** — The integration lane is now big enough to starve itself.
  After merging two features it holds **19 `*.it.test.ts` files**, each pulling
  up its own Postgres through testcontainers. Run together,
  `pnpm exec vitest run .it.test` produced one failure —
  `skills-assembly.it.test.ts > an over-budget assembly drops the tail` — after
  **289 s** on a test that takes **10.5 s in isolation and passes**. The
  hermetic lane (258 tests) was green in the same tree. So a single red in a
  full `.it.test` run is now more likely to be contention than a defect:
  re-run the named file alone before believing it. If it recurs, the fix is to
  cap concurrency for that lane (`--poolOptions.threads.maxThreads`) rather
  than to raise `testTimeout` again — it is already 120 s, and a timeout that
  large stops distinguishing "slow" from "hung".
  `server/vitest.config.ts:16` · `server/test/skills-assembly.it.test.ts`

- **2026-08-19** — `test/prompt-callers.test.ts` and `test/prompt-structured.test.ts`
  fail on this branch's trunk as of commit `2dbaa58` ("feat(context): contracts,
  engine labelling and shared walk limits") — **pre-existing, not caused by any
  later change**: confirmed by `git stash` of an unrelated Track A diff and
  re-running the same two files, which failed identically. Both still call
  `assemblePrompt({ ..., specs: ['a string'] })`, the shape `ReviewInput.specs`/
  `PromptParts.specs` had before that commit widened it to
  `Array<{source, text}>` (specs/09-project-context.md contract change,
  `reviewer-core/src/prompt.ts:99`). `wrapUntrusted` then reads `s.source`/
  `s.text` off a bare string and throws `Cannot read properties of undefined
  (reading 'replaceAll')` (`reviewer-core/src/prompt.ts:47`). Fix is a one-line
  fixture change in each file (`specs: [{ source: 'security-baseline.md', text:
  '...' }]`); not fixed here because neither file is in `server/test/
  project-context/**` or `server/test/reviews/**`. A bare `cd server && pnpm
  test` will show these 2 files / 5 tests red until someone in-scope updates them.
  `server/test/prompt-callers.test.ts:20` · `server/test/prompt-structured.test.ts:19`

- **2026-08-19** — The `pnpm arch` known-violations baseline is smaller than
  every doc that quotes it: `server/.dependency-cruiser-known-violations.json`
  has **10** entries (5 `no-circular`, 3 `routes-no-db`, 1 `helpers-are-pure`,
  1 `no-cross-module-internals`) as of this date, not the "11" / "4
  `routes-no-db`" repeated in `.claude/skills/onion-architecture/SKILL.md` and
  in `plans/09-project-context.plan.md`. One `routes-no-db` violation was
  fixed between when those docs were written and now, and nothing updated the
  count. Trust `pnpm arch`'s own `‼ N known violations ignored` line (or the
  file's length) over any doc-stated number before treating a gate result as
  "matches baseline" — do not chase a phantom "missing violation".
  `server/.dependency-cruiser-known-violations.json`

- **2026-08-14** — `agent_runs.status = 'done'` used to be written **before**
  the `run_traces` row, so a consumer that polls for a terminal status and then
  fetches the trace — which is what the PR page's run drawer and the integration
  helper `runAndTrace` both do — could read a completed run with no trace behind
  it. It surfaced on CI as `TypeError: Cannot read properties of undefined
  (reading 'skills')` in `skills-assembly.it.test.ts`, an error far from its
  cause, and only on the slower runner. The executor now saves the trace first,
  so `done` means "everything about this run is readable". Pinned by
  `test/run-trace-ordering.it.test.ts`, which checks the trace on the FIRST tick
  that reports terminal — a settling delay there would hide the whole window.
  `src/modules/reviews/run-executor.ts:394`

- **2026-08-14** — A poll-until-ready test helper that **returns** on timeout
  instead of throwing converts "we stopped waiting" into "the value is wrong",
  and the two need completely different fixes. `waitForPrRuns` returned the
  half-settled rows at its deadline, so the caller's next line failed as
  `expected 'running' to be 'done'` — which reads as a broken run executor. It
  was a 10s budget against a test that takes **8.3s on a dev machine**, so it
  passed locally and failed only on CI, twice, before the cause was visible.
  Budget is now **90s** — 10s then 30s both went red on CI — and the deadline
  throws with the run ids and their statuses in the message. Size a wait budget
  as a safety net, not near the observed runtime: the loop returns as soon as
  the runs settle, so a generous budget costs nothing when things work and only
  decides how long a genuine hang takes to report. When a wait helper feeds an assertion, make its timeout loud:
  a silent return costs a full CI round-trip to diagnose.
  `test/helpers/runs.ts:14`

- **2026-08-13** — A cap named `MAX_<THING>_PER_<GROUP>` applied with a flat
  `.slice(0, N)` is wrong in a way no small test catches. `tryPersistentBlast`
  ended with `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` over the whole
  rank-sorted list, so a PR touching more symbols than the cap spent the entire
  budget on the first few and **every other changed symbol reported zero
  callers** — which reads as "nothing depends on this", the opposite of the
  truth. Invisible below the cap, and no fixture in the suite was that big. It
  surfaced only against a real indexed repo: two unrelated PRs (85 and 51
  changed symbols) both reported *exactly* 20 callers. After the fix, 54 and 21.
  The grouping is now `capCallersPerSymbol`, a named helper with the trap in its
  doc comment, and `test/repo-intel-caller-cap.test.ts` fails if it reverts.
  When a per-group cap exists, check the granularity it is actually applied at,
  and size at least one fixture above it.
  `src/modules/repo-intel/helpers.ts:22` · `src/modules/repo-intel/service.ts:378`

- **2026-08-09** — `GET /skills` is the **first** route in the server with a
  `querystring` schema (`grep -rn querystring src` returned nothing before it),
  so there was no house pattern for a boolean filter — and the intuitive one is
  wrong. `z.coerce.boolean()` maps the string `"false"` to `true`, because
  coercion is `Boolean(value)` and any non-empty string is truthy, so
  `?enabled=false` would silently list the enabled skills. Spell the two literals
  out: `z.enum(['true','false']).transform(v => v === 'true').optional()`. The
  `.optional()` must come after the transform, or an absent param becomes
  `false` rather than "no filter". `src/modules/skills/routes.ts:28`
- **2026-08-06** — "Cannot reach the DevDigest engine at http://localhost:3001.
  Is the API running?" in the UI usually does **not** mean the API is down —
  check `curl localhost:3001/health` first. The CORS allowlist is exactly one
  origin, built as `http://localhost:${WEB_PORT}`
  (`src/platform/config.ts:77`, consumed at `src/app.ts:90`), and the browser
  treats `127.0.0.1` as a different origin from `localhost`. Opening the client
  at `http://127.0.0.1:3000` therefore gets every request blocked before it is
  sent, and the client surfaces that as "engine unreachable". Reproduce the
  difference with
  `curl -sD- -o/dev/null -H 'Origin: http://127.0.0.1:3000' localhost:3001/health`
  — no `access-control-allow-origin` header comes back. There is no env var for
  the host half; only the port is configurable. `src/app.ts:90`

## Open Questions

- **2026-08-18** — `test/settings-models.it.test.ts` currently fails on
  `pnpm test` (unfiltered) with the repo in its `plans/10-pr-brief.plan.md` P0
  state: it asserts `resolveFeatureModel(..., 'risk_brief')` still resolves to
  the registry default `{ provider: 'openai', model: 'gpt-4.1' }`, but P0
  changed `FEATURE_MODELS`'s `risk_brief` entry to `anthropic`/`claude-haiku-4-5`
  (`contracts/platform.ts:60-66`, Q7) and this test was not updated in the same
  change. Not fixed here — the file is outside `modules/brief/`'s scope for
  this track. Whoever lands next in `modules/settings/` should update the
  expected default. `test/settings-models.it.test.ts:54-56`

- **2026-08-06** — The latest-completed-run cost aggregate on
  `GET /repos/:id/pulls` has no automated coverage; all cost tests landed
  client-side. The behaviour worth pinning is the `status='done'` filter — a
  later failed re-run must not blank out the last good figure — and it needs a
  DB-backed `*.it.test.ts` under `src/modules/pulls/`, since the JS `Map`
  first-seen-wins step cannot be exercised hermetically.
  `src/modules/pulls/routes.ts:131`
