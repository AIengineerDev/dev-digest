# `frontend-ui-architecture` — sources

Every source behind [`SKILL.md`](SKILL.md), grouped by the question it answers.
Read this when you want to change a rule in the skill: the rule's origin is here,
and a rule whose source you cannot find is a rule nobody vetted.

**Trust tiers.** **P** — primary: official docs, or the author of the convention.
**S** — secondary: a considered take by a named practitioner. **T** — tertiary:
content-farm material, useful only as evidence of what the field believes, never
as an argument on its own. Tier is about provenance, not quality of writing.

Collected 2026-08-08 / 2026-08-09.

## Measured baseline

The skill codifies what `client/src` already did. Counts taken 2026-08-09 — if a
future revision contradicts one of these, re-measure before rewriting the rule.

| Fact | Count |
| --- | --- |
| `index.ts` (component barrels) | 46 |
| `styles.ts`, all exporting a single `s` | 23 |
| `constants.ts` | 18 |
| `helpers.ts` | 9 |
| `export *` (4 in app code, 2 in `vendor/`) | 6 |
| `.tsx` files carrying `'use client'` | 62 of 114 |
| `page.tsx`, all Client Components | 7 |
| `error.tsx` / `loading.tsx` / `not-found.tsx` / `route.ts` | 0 |
| Server Actions (`'use server'`) | 0 |

---

## 1. Folder structure — where components live

| Source | Tier | What it settles |
| --- | --- | --- |
| [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | P | The reference layout (`app · components · features · hooks · lib · stores · types · utils`) and, more importantly, the unidirectional rule `shared → features → app`. Our promotion threshold is this rule with route folders in place of `features/`. |
| [bulletproof-react — project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md) | P | Conventions enforced by lint config rather than by README prose. |
| [Next.js — Project Structure and Organization](https://nextjs.org/docs/app/getting-started/project-structure) | P | The framework is deliberately unopinionated. Names three strategies; we use "split by feature or route". Defines `_private-folders`, route groups, `src/`. |
| [Next.js 14 — Routing: Project Organization](https://nextjs.org/docs/14/app/building-your-application/routing/colocation) | P | The older, more detailed colocation page: why a colocated file inside a route segment never becomes a route. |
| [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) | P | The formal alternative: layers, slices, segments, imports only downward. Considered and not adopted — our route tree already provides the slicing. |
| [Robin Wieruch — React Folder Structure](https://www.robinwieruch.de/react-folder-structure/) | S | How structure grows: one file → component folder → technical folders → feature folders. Useful for recognising when a level has been outgrown. |
| [profy.dev — Popular React Folder Structures and Screaming Architecture](https://profy.dev/article/react-folder-structure) | S | Structure should announce the domain, not the framework. |
| [React Handbook — Project Standards](https://reacthandbook.dev/project-standards) | S | Contemporary defaults, cross-checked against the above. |
| [7 Ways to Organize a React App (and when each breaks)](https://rahuulmiishra.medium.com/react-folder-structure-7-ways-to-organize-a-react-app-and-exactly-when-each-one-breaks-ccb10dba68c2) | T | Valuable only for its failure conditions — the criteria for moving between structures. |

## 2. Colocation — the principle the skill is built on

| Source | Tier | What it settles |
| --- | --- | --- |
| [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | P | "Place code as close to where it's relevant as possible", and the three costs of separation: drift, invisibility, context switching. Also names what belongs *outside*: READMEs, integration tests, e2e. |
| [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | P | Pushing state down is a correctness and performance tool, not tidiness. |
| [Kent C. Dodds — Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | P | Server cache ≠ UI state. The direct argument for never mirroring a TanStack Query result into `useState`. |
| [Next.js Colocation Template](https://next-colocation-template.vercel.app/) | S | A worked file tree for colocation under the App Router. |

## 3. Splitting components

| Source | Tier | What it settles |
| --- | --- | --- |
| [React — Thinking in React](https://react.dev/learn/thinking-in-react) | P | The official decomposition method: one responsibility per component, then place state. |
| [React — Keeping Components Pure](https://react.dev/learn/keeping-components-pure) | P | The boundary of what may live in a component at all. |
| [React — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | P | Avoiding derived and duplicated state — the usual source of components that "need" splitting. |
| [SRP in React — cekrem.github.io](https://cekrem.github.io/posts/single-responsibility-principle-in-react/) | S | The "and" test the skill uses verbatim: if describing it needs *and*, split it. |
| [Six Pillars of Component Architecture](https://medium.com/@abbas-roholamin/splitting-a-ui-into-components-in-react-six-pillars-of-component-architecture-04538e542ce5) | T | Raw material for the split checklist. |
| [When to Break Down UI Into Components](https://www.codingtag.com/when-to-break-down-ui-into-components) | T | Cross-check for completeness of that checklist. |

## 4. Where business logic lives

| Source | Tier | What it settles |
| --- | --- | --- |
| [React — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | P | The single most load-bearing source here. No external system → no effect. Derived data is computed during render. |
| [React — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | P | A hook is the unit of reuse for *stateful* logic; a pure function must stay a function. This is exactly our `helpers.ts` vs hook split. |
| [React — Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer) | P | Where transition rules go once `useState` stops carrying them. |
| [React — Escape Hatches](https://react.dev/learn/escape-hatches) | P | The umbrella over effects, refs, and synchronisation — the edge of React's world. |
| [eslint-plugin-react-you-might-not-need-an-effect](https://www.npmjs.com/package/eslint-plugin-react-you-might-not-need-an-effect) | P | Candidate for enforcing rule 4 of the skill's checklist mechanically. Not installed yet. |
| [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/) | S | How hooks replaced container/presentational: the container became a hook. |
| [frontendpatterns.dev — Presentational vs Container](https://frontendpatterns.dev/presentational-vs-container/) | S | Where the old pattern still earns its place — structure, not reuse. |
| [Business vs application logic, and testing them](https://antonyleme.medium.com/business-vs-application-logic-how-to-separate-and-test-your-reactjs-code-4291d0c983b1) | T | The testability argument for extracting pure logic. |

## 5. Constants, utils, helpers

| Source | Tier | What it settles |
| --- | --- | --- |
| [freeCodeCamp — Improve Your ReactJS Code](https://www.freecodecamp.org/news/improve-reactjs-code/) | S | Named constants over magic values; `constants.ts` beside the component. |
| [A recommended folder structure for React.js](https://medium.com/@mehran.hrajabi98/a-recommended-folder-structure-for-react-js-projects-5f04e2748116) | T | Argues for global `src/constants` and `src/helpers` — the position we rejected. Kept deliberately as the opposing case. |
| [JS Best Practices — Strings, Booleans and Constants](https://medium.com/javascript-in-plain-english/javascript-best-practices-strings-booleans-and-constants-740b8f1e96dd) | T | Naming minutiae. |
| [LoginRadius — 32 React Best Practices](https://www.loginradius.com/blog/engineering/guest-post/react-best-coding-practices) | T | Checklist only, for coverage gaps. |

> **Gap worth knowing about:** no authoritative distinction between *utils* and
> *helpers* exists — every source found uses them interchangeably. The skill's
> definition (`helpers.ts` = local, pure, React-free) is ours by decision, not by
> citation.

## 6. Import boundaries and barrel files

| Source | Tier | What it settles |
| --- | --- | --- |
| [Next.js discussion #92926 — Barrel imports](https://github.com/vercel/next.js/discussions/92926) | P | The Next.js team's position on barrels and `optimizePackageImports`. |
| [bulletproof-react issue #204 — validating folder structure](https://github.com/alan2207/bulletproof-react/issues/204) | P | Enforcing structure with lint rather than review. |
| [Catch Metrics — Next.js barrel files and bundle size](https://www.catchmetrics.io/blog/nextjs-bundle-size-improvements-optimize-your-performance) | S | Measured cost of barrels. |
| [Speakeasy — Disabling Barrel Files](https://www.speakeasy.com/docs/sdks/customize/typescript/disabling-barrel-files) | S | "A barrel belongs at a package's public edge." This is the reasoning behind our compromise: one barrel per component folder, named exports only, no aggregating barrels. |
| [Burn the Barrel!](https://uglow.medium.com/burn-the-barrel-c282578f21b6) | T | The circular-dependency case against barrels. |
| [The Hidden Costs of Barrel Files](https://articles.wesionary.team/the-hidden-costs-of-barrel-files-25de560b9f63) | T | Effect on lint and test times. |

## 7. Next.js as architecture

Bundle size and FCP are deliberately out of scope. These sources are here for
ownership of data, placement of boundaries, and what a route is.

### 7a. The server/client boundary

| Source | Tier | What it settles |
| --- | --- | --- |
| [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | P | `'use client'` marks a **module-graph boundary**, not one file. Passing data by props, interleaving via `children`, providers rendered as deep as possible, `server-only` / `client-only` against environment poisoning. |
| [react.dev — `'use client'`](https://react.dev/reference/rsc/use-client) | P | The directive's semantics independent of Next.js. |
| [react.dev — Server Components](https://react.dev/reference/rsc/server-components) | P | The RSC model itself; RSC ≠ SSR. |
| [Josh W. Comeau — Making Sense of React Server Components](https://www.joshwcomeau.com/react/server-components/) | S | The clearest mental model, and it corrects the misconception that matters most here: what decides the boundary is **who imports whom**, not tree position. |
| [Vercel Academy — Client-Server Component Boundaries](https://vercel.com/academy/nextjs-foundations/client-server-boundaries) | P | Vercel's teaching material on the same boundary. |
| [RSC in Practice: Patterns and Pitfalls](https://certificates.dev/blog/react-server-components-in-practice-patterns-and-pitfalls) | S | Catalogue of boundary anti-patterns. |
| [Crossing boundaries: passing server data to client components](https://madewithlove.com/blog/crossing-boundaries-passing-server-data-to-client-components-in-react/) | S | Prop serialisability as a constraint on component API design. |
| [Drawing the Right Boundary](https://www.iamraghuveer.com/posts/nextjs-server-vs-client-components/) | T | Practical heuristics for where the line goes. |

### 7b. Who owns data and mutations

| Source | Tier | What it settles |
| --- | --- | --- |
| [Next.js — Single-Page Applications](https://nextjs.org/docs/app/guides/single-page-applications) | P | **The source that legitimises our architecture.** Official guidance for running the App Router as a SPA against a separate backend — exactly our Fastify + TanStack Query setup. |
| [Vercel discussion #72919 — Server Actions vs Route Handlers for fetching](https://github.com/vercel/next.js/discussions/72919) | P | Maintainers: Server Actions are for mutations, not reads. |
| [Next.js — Route Handlers (`route.ts`)](https://nextjs.org/docs/app/api-reference/file-conventions/route) | P | Needed only when the caller is not our React app — webhooks, third parties, mobile. |
| [makerkit — Server Actions vs Route Handlers](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers) | S | The clearest decision rules. |
| [pean.dev — the rules I actually use](https://www.pean.dev/blog/server-actions-vs-api-routes-in-nextjs-rules-i-use) | S | Same question, from production practice. |
| [Silvestri — all four mechanisms compared](https://silvestri.co/blog/api-route-handlers-server-components-actions-differences) | T | Comparison table of Server Components, Actions, Route Handlers, API Routes. |

### 7c. The route as an architectural unit

| Source | Tier | What it settles |
| --- | --- | --- |
| [Next.js — Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) | P | The `layout → template → error → loading → not-found → page` hierarchy; layouts do not remount within their own subtree. |
| [Next.js — `error.js`](https://nextjs.org/docs/app/api-reference/file-conventions/error) | P | An error boundary's blast radius is a route segment. We chose component-level handling instead — this is what we chose against. |
| [Next.js — `loading.js`](https://nextjs.org/docs/app/api-reference/file-conventions/loading) | P | Sugar over `<Suspense>` at the segment edge; granular states still need manual boundaries. |
| [Next.js — `useSearchParams`](https://nextjs.org/docs/app/api-reference/functions/use-search-params) | P | The URL as state store, and why layouts deliberately do not receive `searchParams`. |
| [Next.js — Missing Suspense boundary with `useSearchParams`](https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout) | P | Why the boundary wraps the smallest subtree that reads params. |
| [Next.js — Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) | P | `(group)` for organisation and multiple root layouts without touching URLs. |
| [App Router in Production: Layouts, Loading, Error Boundaries](https://www.iamraghuveer.com/posts/nextjs-app-router-production/) | S | The three mechanisms as one picture. |
| [Upsun — App Router common mistakes](https://upsun.com/blog/avoid-common-mistakes-with-next-js-app-router/) | T | Negative checklist. |

---

# Addendum — collected 2026-08-10, shipped in skill v1.1.0

Sections 7d–7i below extend §7. They cover the App Router mechanisms the first
pass never reached, all of them **architecture, not performance** — bundle size,
prefetching cost and FCP stay out of scope as before.

These are the sources behind the routing rules added to `SKILL.md` in **v1.1.0**:
when a section earns a `layout.tsx` (7d), why no `middleware.ts` (7e), overlays
as state rather than routes (7f), the single-locale decision (7g), and
`Link` vs `router.push` (7h). §7i (metadata) was researched and deliberately
**not** promoted into a rule.

## Measured baseline (2026-08-10)

Second measurement, `client/src` excluding `vendor/`. The 2026-08-09 table above
still stands; this one covers routing only.

| Fact | Count | Reading |
| --- | --- | --- |
| `page.tsx` | 9 | across 5 top-level sections |
| `layout.tsx` | **1** | root only — no section owns its own chrome |
| `template.tsx` / `default.tsx` | 0 / 0 | |
| `loading.tsx` / `error.tsx` / `global-error.tsx` / `not-found.tsx` | 0 / 0 / 0 / 0 | consistent with §7c's recorded decision |
| `route.ts` | 0 | consistent — nothing but our React app calls us |
| `middleware.ts` | **0** | none at root, none in `src/` |
| Route groups `(name)` | **0** | every folder is a URL segment |
| Parallel `@slot` / intercepting `(.)` routes | **0 / 0** | despite the app having drawers |
| Dynamic segments | 4 | `[repoId]`, `[number]`, `[id]`, `[section]` |
| `export const metadata` | **1** | root layout only; no page sets a title |
| `next/link` | **2 modules** | one screen + one shell hook |
| `useRouter` | 15 files, 20 `push`/`replace` call sites | navigation is overwhelmingly programmatic |
| `next/headers`, `next/server`, `next/dynamic`, `next/image` | 0 each | |

The two facts worth a rule: **nine pages share one layout**, and **navigation is
programmatic almost everywhere** — 20 `router.push` calls against 2 modules that
import `Link`.

## 7d. Nested layouts — when a section earns one

The question the skill cannot currently answer: `/repos`, `/agents`,
`/settings`, `/skills` and `/onboarding` all render inside the single root
layout, so any section-level chrome is re-mounted by each page instead of
persisting across navigation within the section.

| Source | Tier | What it settles |
| --- | --- | --- |
| [Next.js — `layout.js` file convention](https://nextjs.org/docs/app/api-reference/file-conventions/layout) | P | One layout per segment; nesting is automatic; layouts **do not re-render** when navigating between their own children — that persistence is the whole reason to add one. |
| [Vercel Academy — Nested Layouts](https://vercel.com/academy/nextjs-foundations/nested-layouts) | P | The teaching version of the same hierarchy. |
| [Next.js Learn — Creating Layouts and Pages](https://nextjs.org/learn/dashboard-app/creating-layouts-and-pages) | P | Partial rendering: only the page segment changes on navigation within a layout. |
| [LogRocket — Guide to Next.js layouts and nested layouts](https://blog.logrocket.com/guide-next-js-layouts-nested-layouts/) | S | Section-specific sub-navigation as the canonical trigger for a nested layout. |
| [Effectively placing layout and page components](https://medium.com/@kkts9308/effectively-placing-layout-and-page-components-in-next-js-app-router-4698478bb339) | T | Placement heuristics. |

Candidate rule, matching the existing promotion-threshold style: **a section
earns a `layout.tsx` when two or more of its pages share chrome that must
survive navigation between them** — sub-nav, a persistent filter rail, a tab
strip. Shared UI that may remount is just a component. This is the routing
analogue of "promote on the second route", so it should read the same way.

## 7e. `middleware.ts` — and why the answer is "do not add one"

✓ Read in full. This turned out to be the highest-value item in the addendum,
because the framework has moved against the whole mechanism.

| Source | Tier | What it settles |
| --- | --- | --- |
| ✓ [Next.js — `proxy.js` file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) | P | **In Next 16 `middleware` is deprecated and renamed to `proxy`** (function renamed too; codemod `npx @next/codemod@canary middleware-to-proxy .`). Vercel's own stated position: *"We recommend users avoid relying on Middleware unless no other options exist."* Also: proxy now defaults to the **Node.js** runtime (16.0), the `runtime` config option throws, and without a `matcher` it runs on **every** request including `_next/static`. |
| [Next.js — Data Security: authentication and authorization](https://nextjs.org/docs/app/guides/data-security#authentication-and-authorization) | P | Auth must be verified at each data access point, never delegated to the edge layer alone. |
| [WorkOS — Next.js App Router authentication, 2026](https://workos.com/blog/nextjs-app-router-authentication-guide-2026) | S | The same rule from an auth vendor: middleware redirects are UX, not a security boundary. |
| [Authgear — Next.js security best practices](https://www.authgear.com/post/nextjs-security-best-practices/) | S | |
| [Auth.js — Edge compatibility](https://authjs.dev/guides/edge-compatibility) | P | Why an ORM or a DB call in middleware is a mistake. |
| [Next.js Middleware in 2026: beyond auth](https://dev.to/bean_bean/nextjs-middleware-in-2026-beyond-auth-advanced-patterns-most-developers-miss-2d5k) | T | Catalogue of what people put there; useful mostly as a list of things we should not. |

Two consequences for us, both worth stating as rules rather than research:
having **zero** middleware is not a gap to close but the direction the framework
itself is heading; and any advice written for `middleware.ts` has a **version
cliff** at Next 16 — we are on 15.1, so a future upgrade renames the file if one
ever exists. There is also a subtle trap recorded in the doc: a matcher that
excludes a path also skips Server Functions on it, which is precisely why auth
cannot live there.

## 7f. Parallel and intercepting routes — the drawer question

Zero slots and zero interceptors, while the app has at least one drawer
(`RunTraceDrawer`) and a modal-shaped agent editor. That is the textbook use
case, so the absence should be a recorded decision rather than an oversight.

| Source | Tier | What it settles |
| --- | --- | --- |
| [Next.js — Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes) | P | `@slot` folders, partial rendering, `default.tsx` and what happens on reload. |
| [Next.js — Intercepting Routes](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes) | P | `(.)` / `(..)` conventions and the soft-vs-hard navigation split. |
| [vercel/next.js discussion #71586 — Parallel and intercepting route modals](https://github.com/vercel/next.js/discussions/71586) | P | Maintainers and users on the rough edges: modal-to-modal links, and the modal surviving a link to the parent URL. |
| [Using modals with parallel routes, route groups and interceptors](https://medium.com/@bashaus/using-modals-in-next-js-with-parallel-routes-slots-route-groups-and-interceptors-0873e173c96d) | S | The most complete worked example. |
| [One practical application: better UX with modals](https://dev.to/adityabhattad/one-practical-application-of-nextjs-parallel-and-intercepting-routes-better-ux-with-modals-36i0) | T | |

What the mechanism actually buys: a shareable URL for the open overlay, surviving
reload, closing on Back and reopening on Forward. What it costs here: our
overlays open over a client-rendered page whose data comes from TanStack Query,
so the interceptor would have to re-fetch on hard navigation — and the SPA
decision in §7b means there is no server render to intercept in the first place.
**Recommended framing for the skill: overlay state stays component state, and
the exception is an overlay a user would reasonably paste into Slack.** That is
the same "URL is state" test the skill already applies to filters and tabs, so
it costs no new concept.

## 7g. i18n without a locale segment

The setup is deliberate and undocumented in the skill: single locale, no
`[locale]` segment, messages split per feature namespace.
`src/i18n/request.ts` returns `locale: "en"` from a `LOCALE` constant and merges
`messages/en/*.json` by filename into namespaces — which is what lets a feature
agent add `messages/en/<feature>.json` without touching shared code.

| Source | Tier | What it settles |
| --- | --- | --- |
| [next-intl — App Router setup](https://next-intl.dev/docs/getting-started/app-router) | P | The two supported shapes: with and without i18n routing. |
| [next-intl — Request configuration](https://next-intl.dev/docs/usage/configuration) | P | `getRequestConfig` **must** return an explicit `locale` in the no-routing setup — which ours does. |
| [next-intl — example: App Router without i18n routing](https://github.com/amannn/next-intl/tree/main/examples/example-app-router-without-i18n-routing) | P | Reference implementation of exactly our shape. |
| [Discussion #1081 — App Router setup without i18n routing](https://github.com/amannn/next-intl/discussions/1081) | P | The author's own answer on locale sources when the URL carries none. |
| [next-intl — Proxy / middleware](https://next-intl.dev/docs/routing/middleware) | P | What we are opting out of — locale negotiation is the main legitimate reason to add middleware, and we have no second locale. |

Rule candidate: adding a second locale is **not** a message-file change — it
forces a decision between a cookie/header source and a `[locale]` segment, and
the segment version reshapes every route in `app/`. Record it as an ADR-sized
change, not a feature.

## 7h. Navigation: `Link` vs `router.push`

20 `push`/`replace` call sites against 2 modules importing `Link` is a real
imbalance, and it is an architecture question, not a performance one: a
programmatic push renders as a non-link element, so it is invisible to
right-click, middle-click, Cmd-click and to assistive technology.

| Source | Tier | What it settles |
| --- | --- | --- |
| [Next.js — `useRouter`](https://nextjs.org/docs/app/api-reference/functions/use-router) | P | The docs' own line: use `<Link>` unless you have a specific reason not to. `next/router` is deprecated in 15 — `next/navigation` only, which we already follow everywhere. |
| [Next.js — `<Link>`](https://nextjs.org/docs/app/api-reference/components/link) | P | The component's contract. |
| [useRouter vs Link — when to navigate programmatically](https://medium.com/codetodeploy/userouter-vs-link-in-next-js-when-to-navigate-programmatically-3ef832d992cb) | T | The split most people use: declarative for links, programmatic for post-action redirects. |
| [Link vs useRouter](https://www.geeksforgeeks.org/reactjs/difference-between-nextjs-link-vs-userouter-in-navigating/) | T | |

The rule writes itself, and it ties into the a11y work in the sibling skill:
**if the user is choosing where to go, it is a `Link`; if code is deciding after
an event, it is `router.push`.** A row or card that navigates on click needs a
real anchor, not an `onClick`. Worth auditing the 20 call sites before stating
it as settled — some are genuine post-mutation redirects.

## 7i. Metadata ownership — noted, low priority

One `export const metadata`, in the root layout, so every one of the nine pages
shares the title "DevDigest". For a local-first tool with no SEO surface this is
close to harmless, which is why it is recorded here rather than promoted into a
rule. [Next.js — `generateMetadata`](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) (**P**) is the reference if it is ever picked up; the argument for doing so is browser-tab and history legibility, not search.

---

## 8. React Native — researched, not adopted

There is no React Native in this repository: no `package.json` outside
`node_modules/` and `clones/` depends on `react-native` or `expo`. These sources
were gathered for a possible future `react-native-architecture` skill and are
**unverified against any of our code**.

The finding that matters: **Expo Router requires the opposite of our layout.**
Non-route files belong *outside* `app/`, whereas the Next.js App Router
encourages colocation inside the route via `_components/`. One shared "where do
components live" rule cannot cover both frameworks — hence a separate skill, not
a section in this one.

| Source | Tier | Topic |
| --- | --- | --- |
| [Expo Router — Core concepts of file-based routing](https://docs.expo.dev/router/basics/core-concepts/) | P | `app/` as the sole route source; `_layout.tsx`; route groups; non-route files outside `app/` |
| [Expo Router — Introduction](https://docs.expo.dev/router/introduction/) | P | Universal navigation, deep linking |
| [Expo — Router SDK reference](https://docs.expo.dev/versions/latest/sdk/router/) | P | API reference |
| [Expo Router vs React Navigation in 2026](https://dev.to/bhupeshchandrajoshi/expo-router-vs-react-navigation-which-one-should-you-use-in-2026-3khj) | S | File-based vs imperative navigation as an architectural choice |
| [Expo Router in 2026: navigation, auth, pitfalls](https://www.agilesoftlabs.com/blog/2026/06/expo-router-file-based-navigation-deep) | S | Auth flows over file routes |
| [Modern React Native Navigation Guide](https://pavanrangani.com/blog/expo-router-react-native-navigation) | T | tabs / stacks / modals patterns |
| [React Native — About the New Architecture](https://reactnative.dev/architecture/landing-page) | P | Entry point |
| [React Native — Architecture Overview](https://reactnative.dev/architecture/overview) | P | The model |
| [React Native — Fabric Renderer](https://reactnative.dev/architecture/fabric-renderer) | P | The renderer |
| [React Native — Render, Commit, and Mount](https://reactnative.dev/architecture/render-pipeline) | P | Why synchronous layout measurement is now possible |
| [React Native — Threading Model](https://reactnative.dev/architecture/threading-model) | P | What may run synchronously — an architectural constraint |
| [React Native — Glossary](https://reactnative.dev/architecture/glossary) | P | JSI, Codegen, TurboModules, defined correctly |
| [JSI, TurboModules & Fabric developer guide 2026](https://reactnativecoders.com/latest-article/react-native-new-architecture-jsi-turbomodules-fabric-a-complete-developer-guide-2026/) | T | The four pillars in one text. Its performance numbers are unverified — do not repeat them |
| [New Architecture Migration Guide (2026)](https://www.agilesoftlabs.com/blog/2026/03/react-native-new-architecture-migration) | T | Migration order, legacy projects only |
| [React Native — Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code) | P | `.ios.tsx` / `.native.tsx`, `Platform.select` — branching without a runtime wrapper |
| [React Native — StyleSheet](https://reactnative.dev/docs/stylesheet) | P | Styles scope to the component, not the app |
| [BigBinary — Platform-specific styles](https://www.bigbinary.com/blog/apply-platform-specific-styles-in-stylesheet-react-native) | S | `Platform.select` inside stylesheets |
| [Revelry — Organizing Styles in React Native](https://revelry.co/insights/development/styles-in-react-native/) | S | Styles inline vs separate file — the same argument as our `styles.ts` |
| [Manning — Applying and Organizing Styles](https://freecontent.manning.com/applying-and-organizing-styles-in-react-native/) | S | Systematic treatment |
| [Callstack — A Practical Guide to React Native Monorepo](https://www.callstack.com/blog/a-practical-guide-to-react-native-monorepo-with-yarn-workspaces) | S | apps vs shared packages, from ecosystem maintainers |
| [facebook/react-strict-dom](https://github.com/facebook/react-strict-dom) | P | Meta's experiment in shared web/native styled components |
| [Matteo Mazzarolo — RN monorepo for every platform](https://mmazzarolo.com/blog/2021-09-18-running-react-native-everywhere-mobile/) | S | Most detailed layout write-up, but dated 2021 — verify before use |
| [Monorepo Setup for React + React Native + Node.js](https://huyha.zone/blog/post/monorepo-setup-react-react-native-nodejs/) | T | Example including a backend in the same repo |

## 9. Not yet read

Relevant, deliberately deferred. Read these before the next revision of the skill.

- React — [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context) and [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context): the props-vs-context line, which the skill currently leaves unstated.
- TanStack Query — [Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) and [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys): key design is cache architecture, and our hooks layer is where it lives.
- [Testing Library — Guiding Principles](https://testing-library.com/docs/guiding-principles): sets how finely a component can be split before tests start to hurt.
