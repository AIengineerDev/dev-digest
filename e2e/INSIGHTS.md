# Insights — e2e

Decisions about the browser suite and dead ends. Read before adding a flow or
"fixing" a flaky one.

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
  `specs/NN-name.flow.json`
```

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here.

---

## Decisions

### 2026-07-31 — Hermetic runner instead of resetting the dev DB

**What:** `npm run e2e:hermetic` boots an isolated, freshly-seeded stack on
alternate ports (Postgres :5433, API :3101, web :3100).
**Why:** flows assume exactly one seeded repo — flow `02` follows the home
redirect to the *first* repo — so a dev DB with other imported repos fails
02/04/05.
**Rejected:** `docker compose down -v` to reset the dev DB. It deletes the
`devdigest_pgdata` volume along with every real repo and review you imported.

### 2026-07-31 — Deterministic locators, no AI commands

**What:** flows use only `--url`, `--text`, and `find role|text|label`, against
read-only seeded data.
**Why:** the suite must run in CI with no API key and produce identical results
every time.
**Rejected:** agent-browser's `chat` command — convenient, but it makes runs
non-reproducible and requires a key.

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

_None yet._

## Tool & Library Notes

- **2026-08-13** — `wait --text` matches the **rendered** text, not
  `textContent`, so a CSS `text-transform` defeats it. `SectionLabel` uppercases
  its children, which means every card title in the app is asserted as
  `"BLAST RADIUS"` / `"PR BRIEF"` / `"INTENT"` and never as the string the JSX
  actually contains. Asserting `"Blast radius"` failed the whole flow while the
  card was on screen and correct — the failure screenshot in
  `test-results/NN-*-fail.png` is what proves that, so read it before assuming
  the UI is broken. Match the casing you SEE, and prefer a body string over a
  `SectionLabel` title when you have one.
  `specs/09-pr-blast-radius.flow.json:10`

## Recurring Errors & Fixes

_None yet._

## Open Questions

_None yet._
