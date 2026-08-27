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

### 2026-08-18 — The build chain buys judgement only where it changes a verdict

**What:** the agent set is now mixed-model on purpose, not uniformly `opus`.
`spec-creator` and `implementation-planner` stay `opus` — they decide *what* gets
built, and a wrong requirement is the one error every later stage inherits.
`architecture-reviewer` moved to `sonnet`. `plan-verifier` keeps `opus` in its
frontmatter but the `/impl` skill spawns **pass 1 with a `sonnet` override**,
because pass 1 is mechanical (extract stated items, find `path:line` or command
output) while pass 2 judges whether a criterion actually covers a requirement.
`test-writer` was dropped from the chain entirely.
**Why:** four `opus` agents per feature was the dominant cost, and the stages
differ enormously in how much judgement they need. An agent whose own prompt
already forbids an unevidenced verdict — `plan-verifier` downgrades one to
`not checkable here` — is an agent a cheaper model can run, because the format
does the constraining. `.claude/skills/impl/SKILL.md:104`
**Rejected:** moving `plan-verifier` wholesale to `sonnet`. With `test-writer`
gone and the architecture reviewer downgraded, pass 2 became the last strong
check in the chain, and its failure mode — substituting plausible general
observations for the item-by-item walk — is exactly what a weaker model does.
**The cost that was accepted, not eliminated:** no agent writes tests any more.
`plan-verifier` pass 1 still produces the list of acceptance criteria with no
test behind them; `/impl` carries that list to the end of the run and reports it
instead of acting on it. That gap is only acceptable while it stays visible —
if a run's closing report stops naming it, the saving has turned into silent
debt. `.claude/agents/architecture-reviewer.md:5`

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

**What:** standalone packages (four at the time; `mcp/` made five on 2026-08-11),
each with its own `package.json` and lockfile; sharing
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

- **2026-08-17** — In the spec→plan→build→verify chain, run `plan-verifier`
  **twice, against two different documents**, and put the first run before the
  reviewers rather than last. Pass 1 takes `plans/NN-*.plan.md` straight after
  the implementer and answers "was every phase actually built" — the cheapest
  place to discover a silently skipped phase, before anyone pays to review or
  test half-built work. Pass 2 takes `specs/NN-*.md` at the end, and is the only
  check that can catch **a requirement the planner dropped**: any check against
  the plan is blind to it, because the plan is already missing it. This is what
  the `R1…Rn` ids in a `spec-creator` spec are for. Two orderings fall out of it
  and are not arbitrary: `test-writer` runs *after* the architecture loop,
  because findings move files and a test written against the old placement is a
  test rewritten; and pass 1's `Items that were not checkable` list — the
  acceptance criteria whose `Verify by` lane has no test yet — **is**
  `test-writer`'s brief, so nobody has to invent what to cover.
  `.claude/agents/README.md` (Artifacts and the handoff) ·
  `.claude/agents/plan-verifier.md:24`

  **Correction 2026-08-18:** the two-pass ordering still holds and is now what
  `/impl` runs, but the second half of the last sentence does not — `test-writer`
  was removed from the chain on cost grounds the next day (see the Decisions
  entry above). The `Items that were not checkable` list is still produced, and
  is still the right brief; it is now carried to the end of the run and
  **reported** rather than handed to anyone. If test-writer comes back, that list
  is where it plugs in unchanged.

- **2026-08-15** — A documented invariant with no test is not an invariant. An
  audit of `mcp/AGENTS.md`'s 14 documented practices found all 14 still held in
  code, but 5 were unpinned — nothing would fail if a future edit broke them —
  and one of those five, `run_agent_on_pr`'s wait wall staying under the MCP
  SDK client's 60s default, was the one that had **already regressed in
  production**: it was raised to 120s, the host killed the call at 60s and
  discarded the whole result, and the partial-result path never ran. Being
  written down in a `README`/`AGENTS.md` did not stop the regression; only
  `mcp/test/tools.test.ts`'s `WAIT_MS < 60_000` assertion (env-guarded since
  `constants.ts` reads `process.env` at module load) makes it durable. Applies
  generally: when auditing a package against its own documented conventions,
  check which ones are asserted by a test versus merely asserted in prose, and
  pin the gap rather than re-confirming the prose is still accurate.
  `mcp/src/constants.ts:20-36`, `mcp/test/tools.test.ts` (`waits less than the
  host default of 60s`).

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

- **2026-08-11** — "The latest review" is **one agent's opinion, not the PR's
  review.** One trigger of "run all agents" writes one `reviews` row per agent,
  so `ORDER BY created_at DESC LIMIT 1` returns whichever agent happened to
  finish last — and an agent that found nothing blanks the result entirely.
  Measured on the dev DB: PR #482 had 10 review rows, the newest 9 of them
  empty, so a latest-row scope reported zero findings while the Findings tab
  listed two. The correct scope is **every review at the PR's current
  `head_sha`, counting a null `head_sha` as current** — the same tolerant rule
  `isStaleRun` applies in the UI, and the only scope that agrees with what the
  Findings tab renders. `GET /pulls/:id/smart-diff` uses it
  (`server/src/modules/smart-diff/repository.ts:findingsAtHead`); the Pull
  Requests list's FINDINGS column still uses latest-row and is wrong in the same
  way for any multi-agent run — fix it when you are next in that file.
  `server/src/modules/pulls/routes.ts:126` ·
  `client/src/app/repos/[repoId]/pulls/[number]/_components/staleness.ts:14`

- **2026-08-10** — The 2026-07-31 decision below says "each suite is gated by
  its own CI workflow with a path filter". **There is no CI in this repository**
  — no `.github/` directory exists on disk and `git ls-files` tracks no workflow
  file. Verified 2026-08-10. So every gate is a local command a human or an
  agent must remember to run: `pnpm typecheck`, `pnpm test`, and in `server/`
  also `pnpm arch` (which does fail correctly — 11 known violations, exit code
  11). Two consequences: do not write a skill, hook, or doc that says "CI will
  catch this", and when adding the workflows later, the path filters the old
  entry describes still have to be invented, not restored. `server/package.json:11`

  **Correction 2026-08-14:** this stopped holding when `main` gained
  `.github/`. CI exists and runs — five tracked workflows (`client.yml`,
  `mcp.yml`, `reviewer-core.yml`, `server-unit.yml`, `server-integration.yml`)
  — and `gh pr checks` returns real results per PR. The entry was written on a
  branch that predated them. The rest of it still stands: run the local gates
  yourself rather than assuming CI catches it, because the workflows are
  path-filtered and a change outside a filter is never checked.

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

- **2026-08-17** — A subagent's write access **can** be fenced to a path
  mechanically, and `.claude/agents/README.md` recorded the opposite as an open
  question. `settings.json` permission *rules* cannot scope a grant per agent,
  but a `PreToolUse` **hook** can: the payload carries `agent_type` (and
  `agent_id`) whenever the call originates inside a subagent, so one script can
  hard-deny by path for exactly one agent and `process.exit(0)` silently for
  everyone else — `implementer` keeps full write access with the hook installed.
  Return `{hookSpecificOutput:{hookEventName,permissionDecision:"deny",
  permissionDecisionReason}}` on stdout; the reason is what the agent reads, so
  write it as an instruction ("write a new numbered spec instead"), not as an
  error. The fence is only worth what its matcher covers: a `Write|Edit`-only
  matcher is **not** a fence, because `echo … > server/src/x.ts` is a `Bash`
  call and walks straight past it — put `Bash` in the matcher and pattern-deny
  redirection, `tee`/`rm`/`cp`, in-place `sed -i`, state-changing git and the
  package managers, while letting `git log`/`show`/`blame`, `ls`, `rg` and `wc`
  through. And a malformed payload must `exit 0` rather than deny, or a parse
  bug bricks the session. Verified by driving the script with 28 synthetic
  payloads across both tools, including the wrong-agent and no-`agent_type`
  cases. What a hook still cannot do: the `Agent` grant is all-or-nothing, so
  "may only spawn `researcher`" remains prose — a hook cannot see which agent
  type a subagent call names.
  `.claude/hooks/spec-creator-guard.mjs:52` · `.claude/settings.json:6`

- **2026-08-17** — An entrypoint **cannot catch a throw from a module it imports
  statically**: static imports are evaluated before the entry module's own body
  runs, so a `try` there never sees it and the operator gets a stack trace
  instead of the message. This is why `mcp/src/index.ts` calls `loadConfig()`
  first and then `await import('./server.js')` — the config error surfaces as a
  value inside `main()`, one line naming the bad variable and the fix, while
  `constants.ts` (which validates again at its own module load) stays the single
  place the parsed values live. Any fail-fast startup validation in a
  path-aliased, no-emit package needs this shape; a top-level `try` around the
  import does nothing. `mcp/src/index.ts:17`

- **2026-08-15** — Two "measurements" of the same budget guard are only
  comparable if they serialize the same bytes. `mcp/test/tools.test.ts`'s
  `tools/list` guard measures `JSON.stringify(await client.listTools())` — the
  in-process MCP SDK client's *parsed* response, envelope included — not the
  raw JSON-RPC bytes on the wire. Three different numbers had been reported for
  the same package (3910, 3635, 3754) because a raw stdio probe and the SDK
  client parse/re-serialize differently; only the client-side number is
  comparable to the pinned `<4000` guard, because that is what the test itself
  checks. Re-measure by temporarily logging `len` inside that guard, never by
  piping JSON-RPC into the binary by hand. `mcp/test/tools.test.ts:206-210`,
  `mcp/AGENTS.md:41-49`.

- **2026-08-11** — A package whose tsconfig `paths` alias `@devdigest/shared` to
  `../server/src/vendor/shared` **cannot emit JS**, even when every import from it
  is `import type`. Path-mapped `.ts` files join the program, tsc emits them too,
  and the common root shifts: `outDir: "dist"` produced `dist/mcp/src/index.js`
  *and* `dist/server/src/vendor/shared/**`, breaking any `bin` path. This is why
  `reviewer-core` and `mcp` are consumed as source and their `build` is a
  typecheck. If an aliased package needs an executable, register tsx's ESM loader
  in a `.mjs` shim and import the `.ts` entry — one process, no build step.
  `mcp/bin/devdigest-mcp.mjs:1`

- **2026-08-11** — With `@modelcontextprotocol/server` v2, `ctx.mcpReq.signal`
  really does abort when a client cancels `callTool({ signal })` mid-request —
  verified against the in-process `StreamableHTTPClientTransport` +
  `createMcpHandler` test harness (`mcp/test/tools.test.ts`'s `connect()`),
  which bridges the two over a synthetic `fetch`, not a real socket. Same for
  progress: the client only stamps `_meta.progressToken` on the request when
  `callTool` is given an `onprogress` callback, so a handler gating on
  `ctx.mcpReq._meta?.progressToken !== undefined` sends zero notifications to a
  caller that never asked — no separate opt-out needed.
  `mcp/src/tools/run-agent.ts:78`

- **2026-08-11** — With `@modelcontextprotocol/server` v2, type a tool handler's
  return as the SDK's exported `CallToolResult`, never as your own `interface`.
  The SDK's result union carries an index signature and an `interface` is never
  assignable to one, so tsc reports the failure against whichever union member it
  tried last — `Property 'resultType' is missing … but required in type
  'InputRequiredResult'`, which names a feature the code does not use and sends
  you looking in the wrong place. A `type` alias works; an `interface` does not.
  `mcp/src/tools/shared.ts:14`

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

- **2026-08-26** — A **spec amendment that changes a contract both sides encode
  gets implemented on one side and silently not the other**, and the ordinary
  test suite cannot catch it: each side's tests assert that side's half.
  `specs/10-pr-brief.md` amendment A-2 ("a degraded cached row stays cached
  until a human presses Retry") landed in `PrBriefCard.tsx` — which sends
  `force: true` — and never in `modules/brief/service.ts`, which kept
  `if (existing && !existing.degraded)` and so re-billed a model call on every
  page view of a PR whose provider was down. It survived a full verify pass; a
  second pass reading the amendment against **both** sides found it. When an
  amendment lands, grep for every site that encodes the clause before writing
  code, and put the assertion where both halves meet — here an it-test asserting
  the provider is never called, not a client test asserting a flag is sent.
  `server/src/modules/brief/service.ts:146` · `server/test/brief.it.test.ts:224`

- **2026-08-25** — Turning an existing `@devdigest/shared` array-item field from
  absent to required (`ProjectContextDocDetail.attachments[].order`,
  `z.number().int()` with no `.nullish()`) breaks TS compilation in every
  client test file that hand-builds that shape as a fixture — including ones
  in an unrelated module that the task never touched
  (`src/app/skills/.../SkillEditor/_components/ContextTab/ContextTab.test.tsx`
  broke from a change scoped to the agent-side `ContextTab`). `pnpm typecheck`
  catches it immediately and by name, so it's cheap to fix once found — the
  actionable part is budgeting for it: grep the field name across `client/src`
  before treating "made a field required" as a one-file contract edit.
  `client/src/vendor/shared/contracts/platform.ts:299-307`

- **2026-08-17** — An agent that runs `cd server && pnpm test` as a *per-phase*
  gate pays for Postgres on every phase: the script is a bare `vitest run` with
  no filter, `test/` holds 42 files of which **15 are `*.it.test.ts`** driving
  testcontainers, and `vitest.config.ts` sets `testTimeout: 120_000` for exactly
  that reason. With no reporter configured, the default one also prints the full
  roster each time. Scope the iteration gate and quiet it —
  `pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/<topic>
  2>&1 | tail -n 30` (`--reporter=dot` exists on the `vitest ^2.1.8` all three
  packages pin) — and run the unfiltered suite once, at the end. The same shape
  applies to any agent prompt that says "run the gate after each step": name the
  fast gate and the complete gate separately, or the prompt silently means the
  expensive one. `server/package.json:9` · `server/vitest.config.ts:16`

- **2026-08-16** — A feature can look complete in its own commit and be **inert**,
  because the handful of lines that integrate it sit in files every other feature
  also edits — and those merge cleanly from whichever branch happens to touch
  them last. Smart Diff shipped its module, viewer and tests in one commit, while
  the route registration in `server/src/modules/index.ts`, the `useSmartDiff`
  hook, every `prReview.smartDiff` message key and its `pnpm arch` rule arrived
  later in the **Blast Radius** commit on the integration branch. On the
  integration branch everything passed; rebuilt on its own, `GET
  /pulls/:id/smart-diff` returned **404** (`smart-diff.it.test.ts` fails 5/6 with
  `expected 404 to be 200`) and `cd client && pnpm typecheck` failed outright.
  Nothing catches this while branches are only ever merged together. Before
  calling a feature branch done, verify it **alone** on top of `main`: the
  registry entry, the hook + its barrel export, the message keys, and the arch
  rule its spec claims as enforcement. `server/src/modules/index.ts:20`

## Open Questions

_None yet._
