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

### 2026-08-10 — `specs/02-skills.md` phase 6 e2e flow stops at "attach", not "run a review"

**What:** `08-skills.flow.json` creates a skill and attaches it to the seeded
`Test Quality Reviewer` agent (both real UI writes, no LLM), then stops. It does
**not** trigger a review run or assert on the Run Trace, even though phase 6's
literal acceptance text asks for that.
**Why:** `run-executor.ts` resolves the agent's LLM provider
(`container.llm(agent.provider)`, `run-executor.ts:211-218`) **before** it
resolves the agent's skills (`run-executor.ts:246`). `container.llm` throws
`ConfigError` the moment no secret is configured for that provider — which is
exactly the hermetic/CI stack's stated contract ("No Playwright, no LLM, no API
key", `README.md`). So in a genuinely key-free environment, skills are never
even resolved, and neither a successful nor a failed run's trace ever contains
the skill name. On a machine with a real key in `~/.devdigest/secrets.json`
(`LocalSecretsProvider`, which is not overridden by `scripts/e2e.sh`), the run
would proceed far enough to log the skill into the trace but would then make a
real, billed LLM call — which is disallowed regardless of whether the assertion
would pass. No seeded review run exists for this agent either (only the PR's
built-in seed review at `server/src/db/seed.ts:141` has one, and it isn't linked
to any agent), so there is no read-only fixture to assert against instead.
**Rejected:** clicking the real "Run Review" button and asserting on the
resulting trace — works by accident locally (this machine's stored keys), fails
in true CI, and either way risks a real paid API call. Fixing this for real
needs one of: a seeded `agent_runs`/`run_traces` row for this agent (a
`server/src/db/seed.ts` change, out of `e2e/`'s scope) or an env-gated mock LLM
provider the server can swap in for a hermetic run (also server-side).

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
  `specs/10-pr-blast-radius.flow.json:10`

- **2026-08-14** — Same trap, second form: **a CSS-truncated string is not
  matchable either.** The PR list ellipsises long titles, so
  `find text "Add rate limiting to public API endpoints" click` matches nothing
  even though the row is right there and `textContent` holds the full string —
  the screenshot shows `Add rate limiti...`. It is layout-dependent, so it
  passes until a column gets narrower, which is what made it look like a
  merge-order regression when two flows were renumbered. Click the PR **number**
  (`#482`) instead: short, never truncated, unique on the list. Flows `02` and
  `05` still click the full title and are fragile for exactly this reason — fix
  them when you are next in those files. Note the PR row is a bare `div` with an
  `onClick`, so there is no role or accessible name to target instead.
  `client/src/app/repos/[repoId]/pulls/_components/PrRow/PrRow.tsx:36`
- **2026-08-10** — `agent-browser find text "<string>" click` (non-`--exact`)
  can match a `<script>` tag, not the visible element you meant. Next.js embeds
  every `next-intl` namespace as one large serialized hydration payload in an
  inline `<script>`, and `find text` matches raw `textContent` without
  excluding `<script>`/`<style>` — so a common UI label (e.g. "Add Skill", which
  is also a translation key's *value*) matches the script first in DOM order.
  The click then targets an unrendered node and fails with a confusing "Element
  … is covered by `<aside>` at its click point" (the click point defaults near
  `(0,0)`, which the fixed left nav occupies). Prefer
  `find role <role> click --name "<name>"` for anything with an ARIA role
  (buttons, checkboxes) — it ignores non-interactive elements. Add `--exact`
  when the accessible name is a substring of another visible label on the same
  page (e.g. a "Skills" tab button vs. a "Skills Lab" breadcrumb crumb).
- **2026-08-10** — After a client-side navigation click (`router.push`), a
  `wait --text` on content that also exists on the page you're navigating
  *from* (e.g. an agent's name, present in both the list card and the detail
  header) passes immediately without proving the route actually changed. The
  next step can then run against the stale page and fail with "element not
  found". Use `wait --url "<path-fragment>"` right after the click to confirm
  the route changed before asserting on page content.

## Recurring Errors & Fixes

_None yet._

## Open Questions

_None yet._
