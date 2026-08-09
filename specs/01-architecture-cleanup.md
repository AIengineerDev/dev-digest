# Architecture cleanup

**Status:** in progress — items 1, 2, 7 shipped; 6 partly, and its finding corrected
**Packages touched:** server, client, `@devdigest/shared`

| Item | State |
| --- | --- |
| 1 — contract fork | **done** — trees identical, `scripts/check-shared.sh` + `shared:check` guard it |
| 2 — no transactions | **done** for the reachable invariants, with a regression test that fails without them |
| 3 — error translation | not started |
| 4 — layerless modules | not started |
| 5 — container cycles | not started |
| 6 — missing error states | **corrected and partly done** — see the note in that section |
| 7 — `export *` | **done** — zero wildcards left outside `vendor/` |
| 8 — test coverage claim | not started |

Findings from auditing the whole repo against the two architecture skills
(`onion-architecture`, `frontend-ui-architecture`) on 2026-08-09. Every item is
measured, not inferred — the command that produced each number is given so you
can re-check before acting.

Ordered by expected harm, not by effort. Items 1–3 are correctness risks; 4–8
are erosion.

---

## 1. `@devdigest/shared` has forked, and the two copies disagree

**Severity: highest.** This is the only finding that can produce wrong behaviour
in production rather than slow us down.

`client/src/vendor/shared` and `server/src/vendor/shared` are two committed
copies of one contract package, and **five files differ** — the drift is in git,
not just the working tree:

```sh
diff -rq client/src/vendor/shared server/src/vendor/shared
```

| File | Differing lines | Nature |
| --- | --- | --- |
| `adapters.ts` | 45 | Server has the OpenRouter session-id field; client does not |
| `contracts/knowledge.ts` | 35 | Server knows `openrouter` as a provider; client does not |
| `contracts/eval-ci.ts` | 33 | Server imports `Provider`, `CiFailOn`; client's copy is older |
| `contracts/trace.ts` | 5 | Comment drift only |
| `contracts/productionize.ts` | 2 | **`provider: z.enum(['openai','anthropic'])` on the client vs `[...,'openrouter']` on the server** |

The last row is the sharp one. `CLAUDE.md` states that the same Zod schema drives
request validation and response serialization; with two copies that is no longer
true. A server that legitimately returns `provider: 'openrouter'` produces a
payload the client's own schema rejects.

**Fix.** Decide which copy is canonical (the server's is ahead), sync the other,
and then make drift impossible to commit: a `pnpm shared:check` that diffs the
two trees and fails, wired into CI next to `typecheck`. That check is ~5 lines
and removes a whole class of bug.

**Do not** "fix" this by editing only the file that is currently failing — the
rule is contracts change in `@devdigest/shared` first, then in consumers, and
both vendored copies are consumers.

## 2. The server has no transactions at all

**Severity: high.** `grep -rn "\.transaction(" server/src` returns **nothing**,
while these files perform multiple writes:

| File | Write statements |
| --- | --- |
| `modules/repo-intel/repository.ts` | 19 |
| `modules/agents/repository.ts` | 8 |
| `modules/reviews/repository/run.repo.ts` | 7 |
| `modules/pulls/routes.ts` | 7 |
| `modules/reviews/repository/review.repo.ts` | 5 |

Agent versioning is the clearest case: creating an agent writes `agents` and
`agent_versions`, and a crash between them leaves an agent with no initial
version. The same shape appears in run bookkeeping and in the `pr_files` /
`pr_commits` delete-then-reinsert already documented in `server/INSIGHTS.md`
(`modules/pulls/routes.ts:232`) — that one is a **delete followed by an insert
with no transaction**, so an interrupted request can leave a PR with no files at
all.

**Fix.** Per `onion-architecture`, the service owns the transaction boundary and
repositories take `tx` as a parameter. Start with the two invariants that can
corrupt visible state — agent+version, and the `pr_files`/`pr_commits`
reinsert — not with a sweep.

## 3. Error translation runs the wrong direction

`NotFoundError` / `ValidationError` / `ExternalServiceError` from
`platform/errors.ts` are thrown in **routes and services**, and in no repository:

```sh
grep -rln "NotFoundError\|ValidationError\|ExternalServiceError" server/src/modules
# agents/routes.ts, polling/routes.ts, pulls/routes.ts, repos/service.ts,
# reviews/findings.ts, reviews/routes.ts, reviews/service.ts
```

The skill's rule is that the repository translates database failures into domain
errors so a driver-level message never escapes the edge. Today a constraint
violation surfaces as whatever `postgres` threw, and the route decides what it
meant — which puts persistence knowledge in the HTTP layer.

**Fix.** Translate at the repository boundary as those files are touched. Low
urgency on its own, but it blocks item 2 from being clean: transaction rollback
handling belongs with error translation.

## 4. Four modules have no layers at all

`pnpm arch:all` reports 11 pre-existing violations; four are routes reaching the
database directly. These modules have **neither** a service **nor** a repository:

| Module | `routes.ts` | db calls in it |
| --- | --- | --- |
| `pulls` | 375 lines | 40 |
| `settings` | 98 lines | 10 |
| `polling` | 68 lines | 7 |
| `workspace` | 34 lines | 3 |

Note this is worse than the two-layer shape the skill explicitly permits: the
permitted shape is `routes` → `repository`, and there is no repository here.

**Fix, in order.** `pulls` first — it is 375 lines carrying the PR-freshness side
effects that `server/INSIGHTS.md` already flags as surprising, and extracting
`pulls/repository.ts` makes those effects nameable. `workspace` and `polling` are
small enough to do in passing. `settings` last. Only `pulls` plausibly earns a
service by the skill's criterion; the rest stay two-layer.

Drop each fixed violation from `.dependency-cruiser-known-violations.json` in the
same commit.

## 5. Cycles through the composition root

Five of the 11 baseline violations are import cycles, nearly all
`platform/container.ts` ↔ module classes — recorded in `server/INSIGHTS.md`
2026-08-09 with the reason and the trap (do not disable `tsPreCompilationDeps`).

**Fix.** Have the container depend on interfaces rather than on the concrete
classes it constructs. Worth doing when `repo-intel` is next opened; not worth a
dedicated pass.

## 6. Client: components that render loading but never error

> **Correction (2026-08-09).** The original claim below — that failures are
> silent — was wrong, and the number 13 overstated the problem. `lib/providers.tsx`
> already installs a `MutationCache.onError` that toasts every failed mutation,
> and a `QueryCache.onError` that toasts network/5xx query failures. So the user
> *is* told. What is genuinely missing is **inline** state: a panel that shows a
> skeleton, gets an error, and then renders nothing — the toast has already
> faded. Judge each component on that, not on "has no `isError`".
>
> One real bug was found and fixed under this heading: `RunReviewDropdown` fell
> through a failed `useAgents()` into its *empty* branch, so a load failure
> displayed "No agents yet — create one" and invited the user to create a
> duplicate agent. It now distinguishes failure from emptiness, offers a retry,
> and the literal it used moved into `messages/en/prReview.json` (it was
> violating the no-inline-strings rule too). Pinned by three tests.
>
> Still to review on the corrected criterion: `DiffTab` (`usePrComments`),
> `RunTraceDrawer` (`useRunTrace`), `SettingsApiKeys` (`useSecretsStatus`),
> `ConfigTab` (`useProviderModels`), `FindingsCount` (`usePrReviews`).

Rule 6 of `frontend-ui-architecture` — every data-consuming component handles
both states. Measured: 22 files reference `isLoading`/`isPending`, 11 reference
an error state, and these 13 components (test files excluded) have loading and no
error path:

`FindingsTab` · `FindingsPanel` · `FindingsCount` · `DiffTab` ·
`RunReviewDropdown` · `RunTraceDrawer` · `ReviewRunAccordion` ·
`SettingsApiKeys` · `CreateAgentModal` · `AgentCard` · `ConfigTab` ·
`AddRepoView` · plus one under `settings`.

Reproduce:

```sh
cd client/src && for f in $(grep -rl "isLoading\|isPending" --include="*.tsx" app); do
  grep -q "isError\|ErrorState" $f || echo "$f"; done
```

`ErrorState` already exists and is used by the four page-level components — the
pattern is established, it just was not applied downward. A failed query in any
of the 13 currently renders an empty shell with no explanation and no retry.

**Fix.** Mechanical; do it per component as each is touched, and add the check to
the client's PR habits.

## 7. Client: four `export *` barrels

`components/app-shell`, `components/showcase`, `components/page-shell`,
`lib/hooks`. The skill allows one named-export barrel per component folder and
forbids wildcards and aggregating barrels — `lib/hooks/index.ts` is both.

**Fix.** Convert the three component barrels to named re-exports. `lib/hooks`
needs a decision: either name every export or delete the barrel and import from
the topic file (`hooks/reviews.ts`, `hooks/agents.ts`), which is what the rule
prefers.

## 8. Test coverage is thinner than the docs claim

`client/AGENTS.md` and `client/README.md` both say each `_components/<Name>/`
folder carries "its own `*.test.tsx`". Actual: **14 test files for 54
components** (~26%). `server` has 26 test files (7 DB-backed); `reviewer-core`
has 3 for 8 source files.

This is a documentation-accuracy problem before it is a coverage problem: an
agent reading `AGENTS.md` believes tests exist and will not write one. Either
soften the claim to describe intent, or pick the components where a missing test
actually costs us — the findings pipeline is the obvious one.

---

## What is already right — do not "improve" these

Named so nobody spends effort re-deriving them:

- **Ports live in the core.** `GitHubClient`, `LLMProvider`, `SecretsProvider`
  and the rest are interfaces in `@devdigest/shared`, implemented in
  `src/adapters/`, constructed only in `platform/container.ts`. The
  `injected-adapters-only-from-container` rule passes clean across 139 modules.
- **No service imports `fastify`.** The application layer is genuinely
  transport-agnostic.
- **The client never calls `fetch` directly.** Every data path goes through
  `lib/hooks/*` → `lib/api.ts`; the only matches outside `api.ts` are
  `refetch()`.
- **`useEffect` is rare and justified** — 9 files, 1–2 each, all synchronising
  with something external.
- **All 23 `styles.ts` export a single `s`.** The convention holds without
  exception.
- **Client pages are Client Components on purpose.** Backed by the official
  Next.js SPA guidance; not debt.

## Suggested order

1. Item 1 — contract sync + CI check. One session, removes a correctness risk.
2. Item 2 — transactions for the two visible invariants.
3. Item 6 — error states; mechanical, high user-visible value.
4. Item 4 — `pulls` repository extraction.
5. Items 3, 5, 7, 8 — opportunistically, as the files are touched.

## Open questions

- Is `client/src/vendor/shared` meant to be generated from the server copy, or
  are both generated from a source that is not in this repo? The fix in item 1
  differs depending on the answer.
- Item 8: soften the docs, or write the missing tests? That is a scope call, not
  an architecture one.
