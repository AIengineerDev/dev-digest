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

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

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

- **2026-08-05** — The `cost_usd` backfill in migration `0010` embeds a verbatim
  price snapshot copied out of `src/adapters/llm/pricing.ts`, and that
  duplication is deliberate — do **not** "DRY it up" or refresh it when prices
  change. The migration reprices only rows that predate cost persistence;
  re-running it against current prices would silently rewrite history. Runs
  created afterwards get the provider's real billed figure, never this table.
  Models missing from the list stay `NULL` on purpose (renders as "—", not
  `$0.00`). `src/db/migrations/0010_modern_professor_monster.sql:3`


## Recurring Errors & Fixes

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

- **2026-08-06** — The latest-completed-run cost aggregate on
  `GET /repos/:id/pulls` has no automated coverage; all cost tests landed
  client-side. The behaviour worth pinning is the `status='done'` filter — a
  later failed re-run must not blank out the last good figure — and it needs a
  DB-backed `*.it.test.ts` under `src/modules/pulls/`, since the JS `Map`
  first-seen-wins step cannot be exercised hermetically.
  `src/modules/pulls/routes.ts:131`
