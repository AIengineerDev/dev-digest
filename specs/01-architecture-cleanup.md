# Architecture cleanup

**Status:** in progress — items 1, 7, 9, 10 shipped, 4 shipped for `pulls`;
2 shipped but misplaced and **awaiting a decision** (see its 2026-08-10 note);
6 partly
**Packages touched:** server, client, `reviewer-core`, `@devdigest/shared`, repo root

| Item | State |
| --- | --- |
| 1 — contract fork | **done** — trees identical, `scripts/check-shared.sh` + `shared:check` guard it |
| 2 — no transactions | **done, but they landed in the wrong layers** — see the 2026-08-10 note |
| 3 — error translation | not started |
| 4 — layerless modules | **`pulls` done** (2026-08-10) — `settings`, `polling`, `workspace` remain |
| 5 — container cycles | not started |
| 6 — missing error states | **corrected and partly done** — see the note in that section |
| 7 — `export *` | **done** — zero wildcards left outside `vendor/` |
| 8 — test coverage claim | not started — but `GET /pulls/:id` is now covered |
| 9 — no CI at all | **done** (2026-08-10) — 4 workflows; `e2e-web.yml` deferred |
| 10 — client has no ESLint | **done** (2026-08-10) — flat config, all rules `warn`, in CI |
| 11 — client has no error boundaries | not started |
| 12 — client a11y and navigation semantics | not started |
| 13 — `reviewer-core` grounding gate untested | not started |

Findings from auditing the whole repo against the two architecture skills
(`onion-architecture`, `frontend-ui-architecture`) on 2026-08-09, re-measured
and extended on **2026-08-10** against `frontend-ui-architecture` v1.1.0. Every
item is measured, not inferred — the command that produced each number is given
so you can re-check before acting.

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

**Correction, 2026-08-10.** The transactions exist now — and none of them is in
a service, which is where the skill puts the boundary:

```sh
grep -rn "\.transaction(" server/src   # 6 sites outside db/seed.ts
```

| Site | Layer | Verdict |
| --- | --- | --- |
| `modules/agents/repository.ts:103, :140, :274` | repository | wrong — the repository is deciding what is atomic |
| `modules/pulls/routes.ts:238` | **route** | wrong — a transaction must never be visible in `routes.ts` |
| `modules/conventions/service.ts`, `modules/skills/service.ts` | service | correct |
| `modules/skills/writer.ts` | module-internal | acceptable — `writer.ts` is service-side |

The invariants are protected, so this is no longer a correctness risk; it is now
a layering one. The `pulls` one **is fixed** — the transaction moved into
`pulls/service.ts` when the module got its layers (item 4).

**The `agents` three are deliberately left alone, pending a decision.** The
skill's stated reason for the rule is that *"only the service knows which writes
must succeed together"* — and that rationale does not hold here. All three
transactions write tables the `agents` repository already owns (`agents` +
`agent_versions`, and `agent_skills`), no second collaborator is involved, and
`update` is a read-modify-write whose version arithmetic would have to move into
the service with it. Moving them buys no behaviour and adds indirection on the
most safety-critical write path in the server (agent versioning is what makes an
eval replay reproducible).

Two defensible answers, and this is a call for a human:

1. **Move them anyway**, for a rule with no exceptions. Cost: ~40 lines relocated
   across `service.ts`/`repository.ts`, covered by `agents-transactions.it.test.ts`.
2. **Narrow the rule in the skill** to "a transaction that spans more than one
   repository is the service's; a single-repository aggregate write may open its
   own", and record `agents` as the worked example.

Until one is chosen, `agents` stays as it is and this item stays open.

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

**Re-measured 2026-08-10:** unchanged, and now quantified — **none of the eight
repository files imports `platform/errors` at all**:

```sh
for f in $(find server/src/modules -name 'repository.ts' -o -path '*repository/*.ts'); do
  grep -q 'platform/errors' "$f" || echo "$f"
done
```

`agents`, `conventions`, `repo-intel`, `repos`, `reviews` (+ its three
`*.repo.ts` files). Translation happens mostly in services — `skills` in 5
places, `reviews` in 4 — so services carry Postgres knowledge they should not
need.

## 4. Four modules have no layers at all

`pnpm arch:all` reports 11 pre-existing violations; four are routes reaching the
database directly. These modules have **neither** a service **nor** a repository:

| Module | `routes.ts` | db calls in it |
| --- | --- | --- |
| `pulls` | 375 lines → **382 on 2026-08-10** | 40 |
| `settings` | 98 lines | 10 |
| `polling` | 68 lines | 7 |
| `workspace` | 34 lines | 3 |

**2026-08-10:** `pulls` now also owns a transaction in its route (item 2's
correction), so it breaks three skill rules at once — no layers, db in the
route, and a transaction visible in `routes.ts`. It has also grown while the
other three have not, which settles any doubt about ordering: it is not a thin
module that never got around to having layers, it is the one accumulating them
in the wrong file.

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

# Added 2026-08-10

Found by re-auditing the repo against `frontend-ui-architecture` **v1.1.0**,
which added routing and navigation rules the first pass could not check, and by
looking outside `server/` and `client/` for the first time.

## 9. There is no CI, so nothing above stays fixed

**Severity: highest of the remaining items.** Not a code problem — a ratchet
problem.

```sh
ls .github            # no such directory
git ls-files | grep -i workflow   # nothing
```

Every gate in this repo is a local command someone has to remember:
`pnpm typecheck`, `pnpm test`, and in `server/` also `pnpm arch` — which does
work, failing with exit code 11 on the known baseline. Note that root
`INSIGHTS.md` states the opposite ("each suite is gated by its own CI workflow
with a path filter"); that entry is aspirational and has been corrected there.

This is why items 1 and 7 are worth guarding rather than celebrating: nothing
stops them regressing. It also makes item 2's misplacement unsurprising — a
transaction landed in a route and no gate objected.

**Fix.** Three workflows with path filters, matching the per-package split the
repo already assumes: `server/**` → `typecheck` + `arch` + `test`; `client/**` →
`typecheck` + `test`; `reviewer-core/**` → `npm test`. `arch` should run as
`pnpm arch` (new violations only), never `arch:all`, until the baseline is
cleared. Do this **before** items 3 and 4, so their work is held in place.

## 10. `client/` has no ESLint at all

```sh
ls client/eslint.config.* client/.eslintrc*   # nothing
grep -E '"(lint|eslint)"' client/package.json # nothing
```

No config, no `lint` script, no dependency — unusual for a Next 15 app, which
normally ships `eslint-config-next`. Consequences: the rules of hooks,
`exhaustive-deps`, and every accessibility check are unenforced, and items 11
and 12 below are the kind of thing a linter would have caught for free.

**Fix.** Add `eslint.config.mjs` with `eslint-plugin-react-hooks` and
`eslint-plugin-jsx-a11y`, both at `warn` initially so the first run does not
block, plus a `lint` script. Do not wire `pnpm lint` into CI (item 9) before the
config exists — the script would fail rather than no-op.

## 11. Client: zero error boundaries

Distinct from item 6, which is about *query* failures. This is about a component
that throws while rendering.

```sh
grep -rEl 'ErrorBoundary|componentDidCatch' client/src   # nothing, across 86 .tsx
```

The existing net does not cover it: `lib/providers.tsx:35-43` toasts failed
queries and mutations, which is a rejected promise, not a render throw. A bad
`.map` over a nullish field unmounts the tree to a blank page, with no toast and
no fallback. Next's `error.tsx` is deliberately unused here (recorded in the
skill), so nothing replaced it.

**Fix.** One boundary around the app shell, plus one per panel that owns a
query — the granularity the skill states: one per independently recoverable
widget. Not one per component.

## 12. Client: navigation semantics and form labelling

Both are rules added in skill v1.1.0, both measured 2026-08-10.

**Navigation.** 20 `router.push`/`replace` call sites; **13 are destinations the
user chose**, rendered as non-links, so they are unreachable by Cmd-click,
middle-click and assistive technology. The other 7 are correct — five
`router.replace` calls syncing `searchParams`, two post-mutation redirects.

Only two of the 13 are ours to fix: `app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:36`
and `app/agents/_components/AgentsListView/AgentsListView.tsx:89`. The rest sit
inside vendored `Button`s and menu items that accept no `href`, and
`src/vendor/ui` is off-limits — do **not** wrap a `Button` in a `Link` to
satisfy the rule; nested interactive elements are worse than the problem.

**Labelling.** `htmlFor` and `useId` appear **zero** times, against 12 files
using `aria-*` and 10 using `role=`. The intent is there; programmatic
label→input association is not.

**Fix.** The two rows first (cheap, and they are the most-clicked surfaces).
Labelling as part of item 10 — once `jsx-a11y` runs, it will point at the exact
inputs.

## 13. `reviewer-core`: the grounding gate has no test

3 test files for 8 source modules. Tested: `prompt`, `run`, `to-review`.
Untested: **`grounding.ts`**, `review/reduce.ts`, `llm/structured.ts`,
`llm/openrouter.ts`.

`grounding.ts` is the gate that rejects findings the diff does not support — the
one component whose silent failure produces confidently wrong output rather than
an error. It is also pure and has no I/O, so it is the cheapest thing in the
repo to test.

**Fix.** Table-driven test over grounded/ungrounded finding pairs. Fold into
item 8 rather than tracking separately.

## Records that went stale as items shipped

Both verified 2026-08-10; fix them when touching the item, not as a separate pass.

- Root `INSIGHTS.md` still describes the `@devdigest/shared` fork of item 1 as
  live ("five files differ"). `./scripts/check-shared.sh` now reports the trees
  identical. Add a superseding entry — do not delete the original.
- `.claude/skills/frontend-ui-architecture/SKILL.md` still lists the four
  `export *` barrels of item 7 under "Known deviations". There are zero left
  outside `vendor/`. Needs a v1.1.1 that drops the stale bullet.

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

Original order, for the record: 1 → 2 → 6 → 4 → (3, 5, 7, 8 opportunistically).
Items 1, 2 and 7 are done. **Revised 2026-08-10, with items 9–13 folded in:**

1. **Item 9 — CI.** First, not last. Everything below regresses without it, and
   item 2 already shows what happens when nothing objects. Half a day.
2. **Item 4 — `pulls` gets its layers**, which also resolves the route-level
   transaction from item 2's correction. The single largest rule violation left.
3. **Item 2 follow-up — `agents` transactions** move from repository to service.
   Small, and it finishes an item currently marked done.
4. **Item 10 — client ESLint**, at `warn`. Cheap, and it turns items 11–12 from
   manual review into a list the tool produces.
5. **Item 11 — error boundaries**, then the two `Link` fixes from item 12.
6. **Item 3 — error translation** across the eight repositories. Broad and
   mechanical; do it after CI so a regression is visible.
7. **Items 5, 8, 13** — `repo-intel` cycles need their own ADR-sized task; the
   `grounding.ts` test is worth doing the next time anyone opens `reviewer-core`.
8. **Stale records** — fold into whichever item touches them.

## Open questions

- Is `client/src/vendor/shared` meant to be generated from the server copy, or
  are both generated from a source that is not in this repo? The fix in item 1
  differs depending on the answer.
- Item 8: soften the docs, or write the missing tests? That is a scope call, not
  an architecture one.
- Item 9: `origin` is `github.com/AIengineerDev/dev-digest`, so GitHub Actions is
  available and the three workflows are the straightforward answer. The open part
  is whether the repo is private with limited Actions minutes — `testcontainers`
  makes `server`'s `*.it.test.ts` the expensive job, and it may need to run on a
  path filter only, or nightly rather than per push.
- Item 12: the vendored `Button`/menu primitives accept no `href`. Eleven of the
  thirteen navigation sites stay wrong until `@devdigest/ui` changes. Is a
  deliberate vendor change in scope, or do we accept them permanently?
