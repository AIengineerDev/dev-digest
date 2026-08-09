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

_None yet._
