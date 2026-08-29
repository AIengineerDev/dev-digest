---
name: frontend-ui-architecture
description: Decide where frontend code goes in client/ — which folder a component belongs in, when to split it, where constants, styles, helpers, and business logic live, where the server/client boundary sits, and how routes are structured (layouts, overlays, navigation, middleware, i18n). Use BEFORE creating any file under client/src or any folder under app/, when a component grows past one responsibility, when something looks reusable enough to move up, or on "where should this go", "how do I split this", "where do constants go", "should this be a route", "do we need a layout here", "should this open as a modal". Records architecture only — not styling taste, not performance, not test strategy.
version: 1.1.0
---

# Frontend UI architecture

This skill answers one class of question: **where does this code go, and what is
it allowed to know about?** It is the written form of conventions that already
hold across `client/src` — it does not import an architecture from elsewhere.

Everything here is about placement and dependency direction. It says nothing
about how a component should look, how fast it should render, or how it should
be tested. `client/README.md` owns the route map; `client/INSIGHTS.md` owns what
was tried and rejected; [`README.md`](README.md) in this folder holds the
research these rules were drawn from.

## The one rule everything else follows

**Code lives next to the thing it serves, and moves up only when a second
consumer appears.** Proximity is the default; sharing is the exception you earn.
Every table below is this rule applied to a specific kind of file.

## Where does it go?

| You are adding | It goes in | Promote it when |
| --- | --- | --- |
| UI used by exactly one route | `app/<route>/_components/<Name>/` | a second route imports it |
| UI used by two or more routes | `src/components/<kebab-name>/` | never — this is the top |
| App chrome: nav, breadcrumbs, shortcuts | `src/components/app-shell/` | — |
| Anything that reads or writes API data | `src/lib/hooks/*` → `src/lib/api.ts` | — |
| A pure function used by one component | `helpers.ts` beside that component | a third consumer appears → `src/lib/` |
| A pure function used app-wide | `src/lib/<topic>.ts` | — |
| A literal that appears twice, or any magic value | `constants.ts` beside its consumer | same as helpers |
| Inline style objects | `styles.ts` beside the component | — |
| A user-facing string | `messages/<locale>/*.json` (`next-intl`) | — |
| An API payload type | nowhere — import from `@app/shared` | — |

The promotion threshold is **the second route**, not the second import. Two
components inside one route folder sharing a helper is still local code.

Do not create new top-level folders under `src/`. If something fits none of the
rows above, that is a design question — raise it, do not invent a home.

## Component folder shape

A component is a folder, never a loose file. Only create the files it needs.

```
<Name>/
  <Name>.tsx        the component; default is a named export
  index.ts          public edge: export { <Name> } from "./<Name>"
  styles.ts         export const s = { ... } satisfies CSSProperties
  constants.ts      named consts; comment WHY a value is what it is
  helpers.ts        pure functions + local types, no React imports
  <Name>.test.tsx   colocated, vitest + jsdom
```

Rules that make this shape mean something:

- **`index.ts` re-exports by name only.** Never `export *`. The barrel is the
  component's public edge — its job is to say what may be imported, and a
  wildcard says nothing. One barrel per component folder; never an aggregating
  barrel over a group of folders.
- **`helpers.ts` imports no React.** If a function needs state or an effect, it
  is a hook, not a helper, and hooks that touch data belong in `src/lib/hooks/`.
- **`styles.ts` exports a single `s` object.** All 23 existing files do; a
  second export name makes the convention unsearchable.
- **`constants.ts` carries the reasoning.** A constant whose value is arbitrary
  needs a comment stating the constraint that fixed it, or the next reader will
  "simplify" it away.

## When to split a component

Split when you need the word "and" to describe it. "Renders the row **and**
fetches the counts" is two components, or one component and one hook.

Concretely, split when any of these is true:

- It owns state that only one subtree reads — push the state down with the UI.
- Part of it re-renders on data that the rest does not care about.
- Its test needs more than one kind of setup to reach two of its branches.

Do **not** split for line count alone. A 200-line component with one
responsibility and no reusable part is finished code; breaking it up buys
indirection and nothing else.

## Where business logic lives

Four homes, in the order to try them:

1. **Render-time expressions.** Anything derivable from props or state is
   computed during render. No `useEffect`, no mirrored `useState`.
2. **`helpers.ts`.** Pure transformations — parsing, formatting, grouping.
   Testable without rendering; that is the point.
3. **A hook in `src/lib/hooks/`.** Anything involving the server. TanStack Query
   owns server state; never copy a query result into `useState`.
4. **`useEffect`.** Only to synchronize with something React does not own — the
   DOM, a timer, a subscription, a browser API. If no external system is
   involved, the effect is a bug waiting to happen.

Components never call `fetch`. The path is always
component → `src/lib/hooks/*` → `src/lib/api.ts`.

## Next.js: architectural decisions already made

These are settled. An agent that "fixes" one of them without an ADR is making
the codebase worse, not better.

**This client is a SPA inside the App Router, by design.** The backend is a
separate Fastify service; data flows through TanStack Query. All nine pages are
Client Components and that is correct, not debt. Do not convert a page to an
async Server Component to "modernize" it — it cannot fetch through our hooks,
and the API base is a client-side concern.

Consequences that follow, and that you must not import advice against:

| Topic | Our decision | Why the common advice does not apply |
| --- | --- | --- |
| `'use client'` | On the page, at the top of each interactive tree | "Push it to the leaves" assumes server-fetched data; we have none |
| Data fetching | TanStack Query hooks only | Server Components cannot reach our auth/base-URL setup |
| Server Actions | Not used | Mutations go to Fastify through `api.ts` |
| Route Handlers (`route.ts`) | Only for callers that are not our React app | Nothing currently qualifies |
| `error.tsx` / `loading.tsx` | Not used | `isLoading` / `isError` sit next to the query, which is more granular |
| `middleware.ts` | Not used, and not to be added | Deprecated in Next 16 (renamed `proxy`); Vercel's own advice is to avoid it. See below |
| Parallel (`@slot`) / intercepting (`(.)`) routes | Not used | Overlays are component state here, not routes. See below |
| Route groups (`(name)`) | Not used | Every `app/` folder is currently a real URL segment; nothing needs regrouping yet |
| i18n routing | No `[locale]` segment | Single locale, pinned in `src/i18n/request.ts` |

**Loading and error states are the component's job.** Every component that
consumes a data hook handles both, beside the query that produces them. A
component that renders only the success path is incomplete.

**The URL is state.** Filters and selected tabs belong in `searchParams`, not in
`useState`, whenever a user would reasonably expect to share or reload the view.
Note that layouts do not receive `searchParams` — only pages do — so a filter
that a layout needs to read is a signal the filter is in the wrong place.

Route structure: `_components/` is not optional decoration. It keeps colocated
UI out of the router's namespace and marks the folder as private to that route.

## When a section earns a `layout.tsx`

There is exactly **one** layout today — the root — for nine pages across five
sections. That is the starting position, not a rule to preserve.

**A section earns its own `layout.tsx` when two or more of its pages share
chrome that must survive navigation between them.** A layout does not re-render
when you move between its children; that persistence is the only thing it buys
that a component does not. Sub-navigation, a tab strip, a filter rail that must
not reset — those are layouts. Shared UI that may remount is just a component,
and belongs in `_components/` per the table above.

This is the same promotion threshold as the rest of this skill, applied to
routes: the second page, not the second idea.

Do not reach for a route group `(name)` to organise folders that are already
fine. It exists to regroup URLs or to give a subtree its own root layout, and we
need neither yet.

## Overlays are state, not routes

Drawers, modals and the agent editor stay **component state**. We do not use
parallel (`@slot`) or intercepting (`(.)`) routes, and the reason is not
ignorance of them: they buy a shareable URL, survival across reload, and
Back-to-close — and our overlays sit on client-rendered pages whose data comes
from TanStack Query, so there is no server render to intercept.

The exception is the same test this skill already applies to filters and tabs:
**if a user would reasonably paste the open overlay into Slack, it is a route.**
Until one is, an overlay that reads a URL param is the middle ground — cheap,
and no new routing concept.

## Navigation: `Link` or `router.push`

**If the user is choosing where to go, it is a `Link`. If code decides after an
event, it is `router.push`.** A programmatic push renders as a non-link element,
so it is invisible to Cmd-click, middle-click and to assistive technology —
which makes this a structural rule, not a preference.

Correct uses of the router, measured against the current 20 call sites:

- `router.replace` to sync `searchParams` — the URL-is-state pattern above. Five
  sites, all correct. Use `replace`, not `push`, so a filter change does not
  fill the history stack.
- A redirect after a mutation succeeds, or a guard redirect on load.

Everything else — a row, a card, a list item, a CTA that names its destination —
wants an anchor.

**The known constraint:** the vendored `Button` and menu primitives take no
`href`, and `src/vendor/ui` is off-limits. So a menu item or a `Button` that
navigates stays a `router.push` until the primitive changes; do not wrap a
`Button` in a `Link` to satisfy the rule, since that nests interactive elements
and is worse than what it replaces. Rows and cards are **our** markup and have
no such excuse.

## Two routing things not to touch

**Do not add `middleware.ts`.** Having none is the direction of travel, not a
gap: Next 16 deprecates the convention and renames it `proxy`, and Vercel's own
guidance is to avoid it unless nothing else works. If a future task seems to
need one, two traps make it worse than it looks — without a `matcher` it runs on
every request including `_next/static`, and a matcher that excludes a path also
skips **Server Functions** on that path, so auth checked only there is not
checked at all. Auth belongs at the data access point regardless.

**Adding a second locale is an ADR, not a feature.** `src/i18n/request.ts` pins
a single `LOCALE` and merges `messages/en/*.json` by filename into namespaces —
which is what lets a feature add `messages/en/<feature>.json` without touching
shared code. A second locale forces a choice between a cookie/header source and
a `[locale]` segment, and the segment reshapes every route in `app/`.

## Known deviations

Do not treat these as precedent; fix them opportunistically when you are already
in the file.

- `export *` in `components/app-shell/index.ts`, `components/showcase/index.ts`,
  `components/page-shell/index.ts`, and `lib/hooks/index.ts`. The first three
  should become named re-exports; `lib/hooks/index.ts` is an aggregating barrel
  that should not exist.
- `src/vendor/**` follows none of this and is out of scope — it is vendored.
- Thirteen of the twenty `router.push` sites are user-chosen destinations that
  should be anchors. The two worth fixing first are our own markup, not vendored:
  the PR row (`app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:36`) and the
  agents list item (`app/agents/_components/AgentsListView/AgentsListView.tsx:89`).
  The rest sit inside vendored `Button`s and menus — leave them.

## Before you finish

Check the change against these, in order:

1. Nothing new sits at the top of `src/` that could have lived beside its user.
2. No component was promoted to `src/components/` on speculation — a second
   route actually imports it.
3. No `export *` was added.
4. No `useEffect` was added that does not touch an external system.
5. No API type was redeclared that `@app/shared` already exports.
6. Every new data-consuming component renders a loading and an error state.
7. No new `layout.tsx` that only one page uses.
8. Nothing the user clicks to choose a destination was built as a `router.push`
   on our own markup.
9. No `middleware.ts`, no `@slot`, no `(.)` interceptor was introduced.

---

## Version history

| Version | Change |
| --- | --- |
| 1.1.0 | Adds routing architecture, measured in `client/src` on 2026-08-10: when a section earns a `layout.tsx`, overlays as state rather than parallel/intercepting routes, the `Link`-vs-`router.push` rule and its vendored-primitive exception, and the two standing "do not touch" items (`middleware.ts`, second locale). |
| 1.0.0 | First version. Codifies the conventions measured in `client/src` on 2026-08-09: component folder shape, the second-route promotion threshold, the four homes for logic, and the SPA-inside-App-Router decision. |
