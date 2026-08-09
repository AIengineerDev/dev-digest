---
name: frontend-ui-architecture
description: Decide where frontend code goes in client/ — which folder a component belongs in, when to split it, where constants, styles, helpers, and business logic live, and where the server/client boundary sits. Use BEFORE creating any file under client/src, when a component grows past one responsibility, when something looks reusable enough to move up, or on "where should this go", "how do I split this", "where do constants go". Records architecture only — not styling taste, not performance, not test strategy.
version: 1.0.0
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
| An API payload type | nowhere — import from `@devdigest/shared` | — |

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
separate Fastify service; data flows through TanStack Query. All seven pages are
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

**Loading and error states are the component's job.** Every component that
consumes a data hook handles both, beside the query that produces them. A
component that renders only the success path is incomplete.

**The URL is state.** Filters and selected tabs belong in `searchParams`, not in
`useState`, whenever a user would reasonably expect to share or reload the view.
Note that layouts do not receive `searchParams` — only pages do — so a filter
that a layout needs to read is a signal the filter is in the wrong place.

Route structure: `_components/` is not optional decoration. It keeps colocated
UI out of the router's namespace and marks the folder as private to that route.

## Known deviations

Do not treat these as precedent; fix them opportunistically when you are already
in the file.

- `export *` in `components/app-shell/index.ts`, `components/showcase/index.ts`,
  `components/page-shell/index.ts`, and `lib/hooks/index.ts`. The first three
  should become named re-exports; `lib/hooks/index.ts` is an aggregating barrel
  that should not exist.
- `src/vendor/**` follows none of this and is out of scope — it is vendored.

## Before you finish

Check the change against these, in order:

1. Nothing new sits at the top of `src/` that could have lived beside its user.
2. No component was promoted to `src/components/` on speculation — a second
   route actually imports it.
3. No `export *` was added.
4. No `useEffect` was added that does not touch an external system.
5. No API type was redeclared that `@devdigest/shared` already exports.
6. Every new data-consuming component renders a loading and an error state.

---

## Version history

| Version | Change |
| --- | --- |
| 1.0.0 | First version. Codifies the conventions measured in `client/src` on 2026-08-09: component folder shape, the second-route promotion threshold, the four homes for logic, and the SPA-inside-App-Router decision. |
