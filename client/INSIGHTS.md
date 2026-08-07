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

_None yet. Add the first one the next time a UI approach is tried and
abandoned — that is exactly what this file is for._

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

_None yet._

## Recurring Errors & Fixes

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
