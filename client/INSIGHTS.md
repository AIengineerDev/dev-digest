# Insights — client

UI decisions and dead ends. Read before restructuring pages, state, or the data
layer.

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
  `src/path/to/file.tsx:42`
```

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here.

---

## Decisions

### 2026-08-07 — Per-run severity breakdown is derived client-side, not added to `RunSummary`

**What:** The Agent Runs timeline shows its severity icons by deriving
`run_id → {CRITICAL, WARNING, SUGGESTION}` from the reviews the PR detail page
has already loaded (`severityCountsByRun`), instead of the run row carrying the
breakdown. `RunSummary` still exposes only the flat `findings_count`.
**Why:** The detail page holds every review with its findings in the TanStack
cache before the timeline renders, so the breakdown costs one `useMemo` — no
request, no `@devdigest/shared` change, no migration, and no second source of
truth to drift from the findings themselves.
**Rejected:** Widening the `RunSummary` contract with three count columns
denormalized onto `agent_runs` (the way `blockers`/`score` already are). It is
the right shape only for a surface that has no reviews loaded — the PR **list**,
which is why the list's counts do come from the server. Doing it for the
timeline would mean a contract change plus a backfill for rows written before it,
to display data already sitting in memory.
`src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/helpers.ts:16`

## What Works

- **2026-08-06** — The `null` vs `0` cost rule is pinned in exactly two files:
  `src/lib/format.test.ts` asserts both directions (`null`/`undefined`/`NaN` →
  `—`, `0` → `$0.00`, and `0.00002` → `<$0.0001` so a real cost never renders as
  free), and `src/components/run-cost-badge/RunCostBadge.test.tsx` asserts both
  layouts (`compact` prints `—`, `withTokens` drops the segment and must not
  contain `—`). The consuming surfaces do **not** re-assert it — `RunHistory` and
  `RunTraceDrawer` tests only carry `cost_usd` in fixtures — so a surface that
  coalesces `null` to `0` before handing it to the badge would pass the whole
  suite. Add the assertion at the surface when you touch one.
  `src/components/run-cost-badge/RunCostBadge.test.tsx:29`

## What Doesn't Work

_None yet._

## Codebase Patterns

- **2026-08-19** — A route with no `:repoId` in its URL (e.g. `/skills`) is not
  actually repo-blind: `useActiveRepo()` (`src/lib/repo-context.tsx`) tracks one
  global active repo for the whole app — path segment, then `localStorage`
  (`dd-repo`), then the first repo from `useRepos()` — and it already backs the
  shell's own repo switcher, reachable from every page. A repo-scoped feature
  bolted onto a repo-agnostic screen (the skill editor's Context tab, reversing
  spec 09's D2 for skills only) should read this instead of adding a second
  local `useState`/`<select>` for "current repo": a second source would let the
  shell and the feature disagree about which repo is active, the exact class of
  bug D2 was written to avoid for attachment state.
  `src/lib/repo-context.tsx:58`

- **2026-08-19** — `PUT /repos/:id/context/attachments` replaces the WHOLE
  attachment-target set for **one document**, not a delta — so any attach UI
  that is not itself document-centric (a skill- or agent-centric "which docs am
  I attached to" tab) is unsafe to write from until it has that specific
  document's own attachment list. The list endpoint (`GET /repos/:id/context`)
  only carries `agent_count`/`skill_count`, never the targets themselves, so
  toggling from it would silently drop the document's other attachments (every
  agent/skill that isn't the one being toggled). The fix: fetch each row's
  detail via `useQueries`, keyed **identically** to `hooks/core.ts`'s
  `useProjectContextDoc` (`["context-doc", repoId, path]`) so the cache is
  shared rather than duplicated, and disable that row's toggle until its own
  detail has loaded — a click before then is a silent no-op, not a wrong write.
  `src/app/skills/_components/SkillsLabView/_components/SkillEditor/_components/ContextTab/ContextTab.tsx:38`

- **2026-08-10** — Do not act on 2026-era "React Compiler made `useMemo`
  obsolete, delete it" advice here: **the compiler is not enabled**. React is
  19.0 and `next.config.mjs` sets only `reactStrictMode` and the API-base env
  var — no `experimental.reactCompiler`, and the two `react-compiler` hits in
  `pnpm-lock.yaml` are an optional peer of another package, not an install.
  The measured shape (2026-08-10, `src/**` excluding `vendor/`, 86 `.tsx`) is
  the trap: **11 `useMemo` + 9 `useCallback` but 0 `React.memo`** and 0
  `useTransition`/`useDeferredValue`. A `useCallback` exists to keep a prop
  referentially stable, and nothing here is comparing props — so most of those
  are paying a dependency-array cost to stop a re-render that no `memo` boundary
  would have stopped anyway. Neither "delete them all" nor "add more" is right
  cold: enabling the compiler is an ADR, and until then the only honest rule is
  to profile before touching either. `client/next.config.mjs:7`

- **2026-08-10** — The entry below stopped holding: `NAV` in
  `src/vendor/ui/nav.ts` was edited deliberately and now carries a **SKILLS LAB**
  group (Skills, Agents, Conventions) alongside WORKSPACE (Pull Requests), so
  those three routes are reachable from the sidebar. The mechanism the old entry
  describes is unchanged and still binds: `NAV` is the single static source, it
  is vendored, and everything else derives from it — `useShellCommands` and the
  `g`-then-key handler both iterate it (`hooks/useGlobalShortcuts.ts:45`), so a
  new entry gets its command-palette row and shortcut for free, and a route
  added *without* touching `NAV` is still unreachable. Two rules for the next
  edit: `href` may use the `:repoId` token (`resolveHref` fills it), and only add
  an item whose screen exists — the design lists Eval Dashboard, Memory and CI
  Runs, and a nav row pointing at a 404 is worse than a missing one.
  `src/vendor/ui/nav.ts:22`

- **2026-08-09** — A new top-level route cannot get a sidebar entry from
  `src/components/app-shell`: the shell reads its **static** nav list from
  `NAV` in `src/vendor/ui/nav.ts`, which is vendored and off-limits, and that
  list still holds only Pull Requests + Agents. The surrounding wiring is
  already there and misleading — `activeKeyFor` returns `"skills"` for
  `/skills` (`components/app-shell/helpers.ts:33`) and `messages/en/shell.json`
  has `nav.skills`, `nav.eval`, `nav.memory` and more — so a route looks nav-ready
  while nothing renders a link to it. `/skills` therefore ships reachable only by
  URL, command palette (`useShellCommands` also iterates `NAV`, so no entry
  there either) and links from other screens. Adding the entry is a deliberate
  vendor change, not something to slip into a feature branch.
  `src/vendor/ui/nav.ts:21`
- **2026-08-09** — The "do not mirror server state into `useState`" rule has one
  legitimate exception — a **reorderable** list — and it comes with a trap.
  The Agent Editor Skills tab holds the drag order locally because the order only
  becomes server state once a write lands. Seeding that state from the query with
  `useEffect(..., [data])` looks right and is wrong: TanStack refetches on window
  focus, and the refetched array is a **new object with identical contents**, so
  the effect re-fires and throws away a reorder the user just made (or, worse,
  reverts one whose mutation is still in flight). Key the seeding effect on a
  **content signature string** built from the ids and their order, not on the
  array identity, so an idempotent refetch is a no-op. The same applies to any
  future surface with local ordering or a dirty-until-saved editor.
  `src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:48`
- **2026-08-07** — `FindingsCount` looks presentational (it takes a `counts`
  prop) but is **not**: it always calls `usePrReviews` for its hover preview,
  passing `null` when unhovered to keep the query disabled. So every component
  that renders it — and every test of that component — needs a
  `QueryClientProvider`, even when nothing hovers and `prId` is undefined;
  `RunHistory.test.tsx` had to grow one purely to reuse the cell. Two
  consequences when reusing it on a new surface: an em dash is its only
  zero-state (the timeline therefore keeps the plain "0 finding(s)" text for a
  clean run, since "—" would lose that the run happened and found nothing), and
  it must stay under a query provider. Split out a presentational core before
  reusing it anywhere that has no provider.
  `src/app/repos/[repoId]/pulls/_components/FindingsCount/FindingsCount.tsx:36`
- **2026-08-06** — The UI token map and the findings contract disagree on how
  many severities exist, and the map is the wrong one to trust: `SEV` in
  `src/vendor/ui/primitives/tokens.ts:6` has **four** entries (it adds `INFO`,
  with its own colour and icon) while `Severity` in `@devdigest/shared` is a
  three-value enum — `CRITICAL | WARNING | SUGGESTION` — and no finding is ever
  `INFO`. So never build per-severity UI by iterating `SEV` or
  `FindingsPanel/constants.ts`'s `SEVERITY_ORDER` (which also lists `INFO`): a
  counter row, legend, or filter built that way renders a dead `0 INFO` control
  that can never do anything. Iterate the local `SEVERITIES` list instead, and
  keep reading colours/icons/labels from `SEV` by key. The same mismatch will
  bite any future group-by-severity surface.
  `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts:14`
- **2026-08-06** — Counts shown next to a filter control must be computed from
  the **unfiltered** collection. `countBySeverity` deliberately takes the raw
  `findings` array, not `shown`: counting the filtered list makes a chip read
  `0` the instant you switch it off, so the user can no longer see what they
  would be switching back on. Related: any list with index-addressed keyboard
  navigation must reset its focus index when the filter changes — `FindingsPanel`
  resolves `j`/`k` and the `a`/`d` accept/dismiss shortcuts against `shown[i]`,
  so a stale index after filtering fires the action on a different finding than
  the one the user sees marked.
  `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts:24`
- **2026-08-05** — `null` cost and `0` cost are different statements and must
  render differently: `null` = "we have no figure for this run" → `—`; `0` = the
  run genuinely was free (the price book lists free models at `0`) → `$0.00`.
  Never coalesce one into the other on the way to the UI. Density decides how
  `null` degrades: the compact PR-list column prints `—`, while the
  `withTokens` timeline variant drops the cost segment entirely rather than
  printing `9 119 tok · —` on every unpriced row.
  `src/components/run-cost-badge/RunCostBadge.tsx:1`, `src/lib/format.ts:20`
- **2026-08-05** — One run cost is shown on three surfaces, but only **two** go
  through `RunCostBadge` with a `variant` prop: the PR-list column
  (`compact`, `PRRow.tsx:62`) and the PR-detail timeline (`withTokens`,
  `RunHistory.tsx:202`). The run trace drawer calls `formatCostUsd` directly
  (`RunTraceDrawer/_components/TraceBody/TraceBody.tsx:67`) because it renders a
  row of four identical `Stat` tiles (DURATION / TOKENS / COST / FINDINGS) that
  the badge's own markup does not fit. What is shared is the **formatter**, not
  the component — so a change to the `null`/`$0.00` rule belongs in
  `format.ts`, and a change to badge markup will silently miss the drawer. Run costs span three orders of
  magnitude (~$0.001 flash to ~$0.10 frontier), so `formatCostUsd` prints 4dp
  with trailing zeros trimmed to a 2dp floor and `<$0.0001` below resolution —
  a fixed precision is lossy at one end or noisy at the other, and rounding to
  `$0.0000` reads as free. `src/lib/format.ts:20`


## Tool & Library Notes

- **2026-08-16** — A **raw NUL byte written into a `.ts` source** — the natural
  separator for a `"path" + line` map key, since no path can contain one — makes
  git classify the whole file as binary. `git diff` then prints `Bin 0 -> 4536
  bytes` and shows nothing, and `grep` goes silent on it, so the file becomes
  invisible to review while still compiling and passing its tests. Found in
  `SmartDiffViewer/helpers.ts`, in a product whose purpose is reviewing diffs.
  Spell it as the escape `"\u0000"` in a named constant instead: same key bytes
  at runtime, file stays text. The same applies to any control character used as
  a delimiter, and to commit messages — git rejects a NUL there outright.
  `src/app/repos/[repoId]/pulls/[number]/_components/SmartDiffViewer/constants.ts:38`

- **2026-08-10** — `eslint-plugin-react-hooks` v7 exposes **two** config shapes
  and the obvious one is the wrong one: `configs.recommended` and
  `configs['recommended-latest']` are still eslintrc-shaped (`plugins` is an
  array), while the flat-config versions live one level down under
  `configs.flat['recommended-latest']`. Passing the top-level one to
  `tseslint.config()` fails with *"A config object has a 'plugins' key defined
  as an array of strings"*, which reads like a bug in your own config rather
  than a wrong import. Same trap will apply on the next major. Note also that
  v7's recommended set is much wider than v5's — it ships `set-state-in-effect`,
  which flags 8 files here that `exhaustive-deps` alone never touched.
  `client/eslint.config.mjs:45`

- **2026-08-10** — Do not add a `middleware.ts` here without a hard reason, and
  treat any blog post about one as version-fragile: **Next 16 deprecates the
  `middleware` convention and renames it to `proxy`** (the exported function too;
  codemod `npx @next/codemod@canary middleware-to-proxy .`), and Vercel's own
  wording in that doc is *"avoid relying on Middleware unless no other options
  exist"*. We are on Next 15.1 with **zero** middleware, which is the direction
  the framework is heading, not a gap. Two traps if one is ever added: without a
  `matcher` it runs on every request including `_next/static`, and a matcher that
  excludes a path also skips **Server Functions** on that path — so auth checked
  only there is not checked at all. The one legitimate reason we might have had
  is locale negotiation, and `src/i18n/request.ts` deliberately avoids it by
  pinning a single `LOCALE`. `client/src/i18n/request.ts:14`

- **2026-08-10** — `client/` has **no ESLint at all** — no `eslint.config.*`, no
  `.eslintrc*`, no `lint` script, and no eslint dependency in `package.json`;
  the only gates are `pnpm typecheck` and `pnpm test`. This is unusual for a
  Next 15 app (there is no `eslint-config-next` either), so every rule that
  other React codebases get mechanically is unenforced here: `react-hooks`
  (`exhaustive-deps`, rules of hooks), `jsx-a11y`, and unused-var hygiene. Two
  consequences: do not assume a lint gate will catch a hook-order or dependency
  mistake before review, and do not add a `pnpm lint` to a CI workflow or a
  pre-push step without first adding the config — the script does not exist and
  the step will fail, not no-op. `client/package.json:6`
  **Stopped holding by 2026-08-17**: `client/package.json` now has
  `"lint": "eslint src"` and `client/eslint.config.mjs` exists (the very next
  entry above describes it). `pnpm lint` is a real gate with a measured
  **0-error, 42-warning baseline** (mostly `react-hooks/set-state-in-effect`) —
  green means no *new* errors and no more than 42 warnings, not a clean run.
  Treat any plan or doc still citing "no ESLint here" as stale.

- **2026-08-17** — Reflecting an incoming URL/prop into local reveal state with
  a plain `useEffect` (`if (x) setState(...)`, deps `[x]`) trips
  `react-hooks/set-state-in-effect` and pushes `pnpm lint` **past** the
  42-warning baseline — one new occurrence is a regression the gate is built to
  catch. On a component that unmounts and remounts on the triggering
  navigation (here, `DiffTab` under `page.tsx`'s `{tab === "diff" && …}`), the
  fix is not an effect at all: seed the state from a **lazy `useState`
  initializer** (`useState(() => x ? … : null)`) instead. The initializer only
  runs on mount, which is exactly when the prop needs picking up, and it costs
  zero warnings. This also gets a "clicking the same target twice re-triggers
  the reveal" requirement for free, without a `nonce` query param — a fresh
  mount has no prior value to compare against.
  `src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/useFindingMarks.ts:60`

- **2026-08-09** — In a `next-intl` message, a bare `{count}` placeholder is
  **string interpolation, not number formatting**: passing `8000` renders
  `8000`, never `8,000`. Only the explicit `{count, number}` form goes through
  `Intl.NumberFormat`. This bit a Skills Lab test that asserted
  `MAX_SKILL_BODY_CHARS.toLocaleString("en-US")` against the rendered character
  counter and failed with `expected "8,000" … received "8000"`. Assert the raw
  value, or opt the message into `, number` if grouping is wanted — and expect
  the same trap in any counter/limit/price string.
  `messages/en/skills.json` (`editor.count`, `editor.overLimit`)

## Recurring Errors & Fixes

- **2026-08-10** — React's "updating a style property during rerender when a
  conflicting property is set" warning counts `borderColor` and `borderWidth` as
  **shorthands**, not longhands — each sets all four sides. Dropping `border:` in
  favour of `borderColor` + `borderLeftColor` does not fix the warning; only
  per-side properties do (`borderTopColor`, `borderRightColor`,
  `borderBottomColor`). It fires on rerender, so it survives any test that
  renders once. `_components/FindingCard/styles.ts:5`

- **2026-08-09** — A component with no `isError` branch is **not** failing
  silently: `lib/providers.tsx:35-43` installs a `QueryCache.onError` that toasts
  network/5xx query failures (expected 4xx stay quiet on purpose, for inline
  empty states) and a `MutationCache.onError` that toasts **every** failed
  mutation. So do not "fix" a component by adding a toast — it will fire twice.
  The gap worth hunting is different and quieter: a component that renders a
  loading state, gets an error, and then falls through to its **empty** branch.
  `RunReviewDropdown` did exactly this — a failed `useAgents()` left `data`
  undefined, `agents ?? []` made it look like zero agents, and the menu invited
  the user to create a duplicate of an agent they already had. When a component
  has both an empty state and a query, check that `isError` is handled *before*
  `length === 0`, and pin it with a test that renders the hook as
  `{ data: undefined, isError: true }` — the happy-path test cannot catch it.
  `src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx:54`
- **2026-08-01** — A vitest failure whose two sides look identical —
  `expected '9 119 tok' to be '9 119 tok'` — is a look-alike Unicode space, not
  an environment difference. `formatTokenCount` had a literal THIN SPACE
  (U+2009) typed into `.replace(/,/g, " ")`, invisible in the diff and in the
  test output. Dump code points first —
  `[...s].map((c) => c.charCodeAt(0).toString(16))` — before theorising about
  ICU or jsdom locale data, which is where this was initially misdiagnosed.
  Group digits with `.replace(/\B(?=(\d{3})+(?!\d))/g, " ")` rather than
  `toLocaleString` plus a separator swap, so the separator is a plain U+0020 a
  test can type. Find strays with `rg '\x{2009}' src/`.
  `client/src/lib/format.ts:40`

## Open Questions

- **2026-08-10** — There are **zero error boundaries** in the client (0
  `componentDidCatch`, 0 `ErrorBoundary`, 1 `Suspense` across 86 `.tsx`), and
  the existing safety net does not cover the gap: the `QueryCache.onError` /
  `MutationCache.onError` toasts at `src/lib/providers.tsx:35-43` catch
  **rejected requests**, not **render throws**. So a component that throws while
  rendering — a bad `.map` over a nullish field, an undefined enum key — unmounts
  the tree to a blank page with no toast and no fallback. Open: at what
  granularity to add them. The consensus in the field is one boundary per
  independently recoverable widget, which for this app would be the page shell
  plus each panel that owns a query, but nothing is decided and Next's
  `error.tsx` convention is deliberately unused here (see
  `frontend-ui-architecture` SKILL.md). Do not scatter per-component boundaries
  as a first move. `src/lib/providers.tsx:35`
