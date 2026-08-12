# `react-component-quality` — parked research

> **This is not a skill.** There is no `SKILL.md` in this folder and none is
> planned for now, so nothing here is ever loaded into a prompt or costs
> anything per run. It is parked research, kept because it was expensive to
> gather and the gaps it measured are real.
>
> Decision, 2026-08-10: the skill effort went into **architecture only** —
> [`frontend-ui-architecture`](../frontend-ui-architecture/SKILL.md) v1.1.0 —
> to avoid a second skill overlapping the first. Revisit this file if the
> quality questions below (rendering, state, effects, failure, a11y, tests)
> ever become worth their own skill. Before writing one, re-measure: the
> baseline here is a snapshot of 2026-08-10.

Raw material, not a rule set.

Scope, and the line against the neighbouring skill: [`frontend-ui-architecture`](../frontend-ui-architecture/SKILL.md)
owns **where code goes**. This one owns **how the code behaves once it is
there** — rendering, state, effects, failure, accessibility, tests. Any rule
here that starts with "put it in…" belongs in the other skill, not this one.

**Next.js is not in this skill.** Routing, layouts, the server/client boundary,
middleware/proxy, parallel and intercepting routes, i18n routing and
`Link` vs `router.push` are all placement-and-boundary questions, and they live
in that skill's [`README.md`](../frontend-ui-architecture/README.md) §7 and §7d–7i.
The one place the two genuinely meet is error handling: §7 records *why* we do
not use `error.tsx`, and §7 below records that nothing replaced it.

**Trust tiers.** **P** — primary: official docs, or the author of the
convention. **S** — secondary: a considered take by a named practitioner.
**T** — tertiary: content-farm material, useful only as evidence of what the
field believes, never as an argument on its own. Tier is about provenance, not
quality of writing.

**Read status.** ✓ = fetched and read in full. Everything else was surfaced by
search and is recorded from its abstract only — do not cite an unread source as
the origin of a rule without reading it first.

Collected 2026-08-10.

---

## Measured baseline

Counts over `client/src`, excluding `vendor/`, taken 2026-08-10. Same method as
the first skill: measure before writing a rule, and re-measure before changing
one. **86 `.tsx` files total.**

| Fact | Count | What it implies |
| --- | --- | --- |
| `useState` | 37 | the dominant state tool by far |
| `useEffect` | 13 | needs auditing against "you might not need an effect" |
| `useMemo` / `useCallback` | 11 / 9 | hand-memoized, with no compiler to justify or replace it |
| `React.memo` | 0 | so the memo hooks above mostly cannot be stopping re-renders |
| `useReducer` | 0 | no reducer pattern anywhere |
| `createContext` / `useContext` | 3 / 5 | context exists but is small |
| `useRef` | 8 | |
| `useTransition` / `useDeferredValue` | 0 / 0 | no concurrent features in use |
| `ErrorBoundary` / `componentDidCatch` | **0** | a render throw takes down the tree |
| `Suspense` | 1 | |
| `<form` / `react-hook-form` | **0 / 0** | there are no forms — do not write form rules |
| `aria-*` / `role=` | 12 / 10 | some a11y intent already present |
| `htmlFor` / `useId` | **0 / 0** | inputs are not programmatically labelled |
| `tabIndex` / `onKeyDown` | 2 / 5 | |
| test files | 20 | against 86 `.tsx` |
| tests using `ByRole` | 6 of 20 | |
| `userEvent` | **0** | `@testing-library/user-event` is not even a dependency |
| `data-testid` | 1 | good — the escape hatch is barely used |

**Tooling facts that shape the whole skill:**

- **`client/` has no ESLint at all** — no config file, no `lint` script, no
  eslint dependency. Scripts are `dev`, `build`, `typecheck`, `test`. Every
  rule this skill states is therefore enforced by review or by nothing.
- **React Compiler is not enabled.** React 19.0, Next 15.1; `next.config.mjs`
  sets only `reactStrictMode` and an env var. The two `react-compiler` hits in
  the lockfile are an optional peer of another package, not an install.
- Test stack is Vitest 2.1 + `@testing-library/react` 16 + jsdom 25.

---

## 1. Rules of React — the foundation everything else rests on

Purity, idempotence, immutability of props/state/hook arguments, and the rules
of hooks. Every other section is a consequence of this one.

- ✓ **P** — [Rules of React](https://react.dev/reference/rules) — components must be idempotent; side effects outside render; props, state, hook arguments and values passed to JSX are all immutable; never call a component function directly; hooks only at the top level of a React function.
- **P** — [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks) — the official enforcement of the above, and [on npm](https://www.npmjs.com/package/eslint-plugin-react-hooks).
- **P** — [Keeping Components Pure](https://react.dev/learn/keeping-components-pure) *(also cited by the architecture skill)*.
- **P** — [legacy: Rules of Hooks](https://legacy.reactjs.org/docs/hooks-rules.html) — older phrasing, still the clearest statement of the ordering rule.

## 2. Re-renders, memoization, and React Compiler

The live question for this repo: 11 `useMemo` + 9 `useCallback` + 0 `React.memo`
+ no compiler. The field has moved decisively since those were written.

- ✓ **P** — [React Compiler — Introduction](https://react.dev/learn/react-compiler/introduction) — build-time automatic memoization; **assumes** Rules of React compliance and mis-optimizes code that breaks them; `useMemo`/`useCallback` survive as explicit escape hatches; new code should rely on the compiler, existing memoization should be left alone or removed only with testing.
- **S** — [Developer Way — React re-renders guide: everything, all at once](https://www.developerway.com/posts/react-re-renders-guide) — the four actual causes of a re-render (state, parent, context, hooks) and the myth that prop changes cause them. The single best source in this section.
- **S** — [Developer Way — React key attribute: best practices for performant lists](https://www.developerway.com/posts/react-key-attribute).
- **S** — [Syncfusion — React Compiler Explained: Do You Still Need useMemo, useCallback, React.memo?](https://www.syncfusion.com/blogs/post/react-compiler-usememo-usecallback).
- **S** — [Certificates.dev — React Compiler: No More useMemo and useCallback](https://certificates.dev/blog/react-compiler-no-more-usememo-and-usecallback).
- **S** — [Adeel Imran — Migration guide to React Compiler 1.0](https://adeelhere.com/blog/2026-03-24-react-compiler-migration-guide) — names the one durable manual case: function identity as part of an integration contract with an external system.
- **T** — [RealCoding — Drop useMemo and useCallback](https://realcoding.blog/2026/03/23/react-compiler-automatic-memoization-en/) · [Pavan Rangani — Automatic Memoization Guide 2026](https://pavanrangani.com/blog/react-compiler-automatic-memoization-guide) · [buildmvpfast](https://www.buildmvpfast.com/blog/react-compiler-production-usememo-usecallback-obsolete-2026) · [suhaib.in notes](https://notes.suhaib.in/docs/tech/programming/react-compiler-killed-usememo-2026/) · [Medium — end of memoization with React 19](https://medium.com/@ashantiwankaperera/end-of-memorization-with-react-19-react-memo-usecallback-usememo-b8df7f18aba1) — five sources saying the same thing; evidence of consensus, not five arguments.
- **T** — [Anthony Coffey — Preventing Unnecessary Re-Renders](https://coffey.codes/articles/preventing-unnecessary-re-renders-in-react-apps) · [dev.to — React re-renders guide](https://dev.to/adevnadia/react-re-renders-guide-preventing-unnecessary-re-renders-21dm) (mirror of the Developer Way piece).

**Tension to resolve before writing the rule:** the compiler is not enabled
here, so "delete your memoization" is wrong advice for this codebase. The rule
has to be conditional on that, or the skill has to recommend enabling the
compiler first — which is an ADR, not a skill rule.

## 3. State: where it lives and what shape it takes

- **P** — [Managing State](https://react.dev/learn/managing-state) — the hub.
- **P** — [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) — avoid redundant and duplicated state.
- **P** — [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context) · [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context) — *carried over from the architecture skill's "not yet read" list; the props-vs-context line is still unwritten in either skill.*
- **P** — [Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer) — relevant precisely because `useReducer` count is 0.
- **S** — [Kent C. Dodds — Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) — lifting state is the answer; context only when prop drilling genuinely hurts.
- **S** — [Developer Way — React State Management in 2025: What You Actually Need](https://www.developerway.com/posts/react-state-management-2025).
- **T** — [Medium — Best State Management Strategies in React 19](https://medium.com/@roman_j/the-best-state-management-strategies-in-react-19-bb51f64775c6) · [Medium — React 19 improved Context API](https://medium.com/@ignatovich.dm/react-19-state-management-with-improved-context-api-82bba332bb69) · [All Hands on Tech — 8 tips](https://www.allhandsontech.com/programming/react/react-state-management-8-helpful-tips) · [CodeBegun — local to global](https://www.codebegun.com/learn/react/state-management/react-state-management-overview) · [dev.to — best practices](https://dev.to/hasunnilupul/best-practices-for-managing-state-in-react-1clg) · [dev.to — context overview](https://dev.to/crossskatee1/react-context-state-management-an-overview-of-benefits-and-best-practices-opi).

**Derived state** is the crisp rule the field agrees on: anything derivable
*must* be derived during render, never mirrored into state. Note this partly
overlaps the architecture skill's "four homes for logic" — the split should be
that the other skill says *which file*, this one says *derive, don't store*.

## 4. Effects — mostly a list of what not to do

13 `useEffect` in the codebase, and the architecture skill already says effects
are only for external systems. This section is about auditing the existing ones.

- **P** — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) *(shared with the architecture skill)*.
- **P** — [Escape Hatches](https://react.dev/learn/escape-hatches) *(shared)*.
- **P** — [eslint-plugin-react-you-might-not-need-an-effect](https://www.npmjs.com/package/eslint-plugin-react-you-might-not-need-an-effect) — mechanizes the above; `recommended` (warn) vs `strict` (error) configs.

## 5. Custom hooks

- **P** — [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) — custom hooks share stateful *logic*, never state itself.
- **S** — [Paulund — Custom Hooks: Naming and Structure](https://paulund.co.uk/notebook/react/custom-hooks-naming-and-structure) — name what it returns or manages, not how it works; `useCart` / `useWindowSize`, never `useData` / `useUtils` / `useHelper`.
- **S** — [Felix Gerschau — React hooks and separation of concerns](https://felixgerschau.com/react-hooks-separation-of-concerns/) *(shared with the architecture skill)*.
- **T** — [dev.to — Mastering Custom React Hooks](https://dev.to/austinwdigital/mastering-custom-react-hooks-best-practices-for-clean-scalable-code-40b1) · [Stackademic — hook naming conventions](https://blog.stackademic.com/react-hook-naming-conventions-best-practices-and-guidelines-32ac80c1580e) · [XTIVIA — hooks for code reuse](https://www.xtivia.com/blog/building-react-custom-hooks-for-code-reuse/) · [Affinity Reader — hooks best practices](https://www.affinityreader.com/2026/01/react-hooks-best-practices-writing.html).

Note the naming rule collides with Alex's own anti-pattern list ("broad names
like `utils`/`helpers` are useless") — same principle, different artifact. Worth
stating once and cross-referencing.

## 6. Lists and keys

- **P** — [Rendering Lists](https://react.dev/learn/rendering-lists) — stable, unique keys; index keys break on reorder and insert.
- **S** — [Developer Way — React key attribute](https://www.developerway.com/posts/react-key-attribute) — also debunks "adding a key improves list performance" on its own.
- **T** — [BSWEN — How React reconciliation works](https://docs.bswen.com/blog/2026-03-03-react-reconciliation-keys/) · [Medium — index as key anti-pattern](https://medium.com/@keshavkattel1998/why-using-index-as-a-key-is-a-react-anti-pattern-a-deep-dive-7fa38c128eae) · [w3reference — keys and state preservation](https://www.w3reference.com/blog/react-keys-and-you/) · [w3tutorials — pitfalls of index keys](https://www.w3tutorials.net/blog/react-using-index-as-key-for-items-in-the-list/) · [OWASP/Nest issue #3410](https://github.com/OWASP/Nest/issues/3410) — a real project enforcing the rule.

## 7. Error handling and boundaries

Zero boundaries in the codebase today. The architecture skill mandates a loading
and an error state per query — that covers *rejected fetches*, not *render
throws*. This is a genuine hole, not a duplicate rule.

- **P** — [react.dev — Error Boundary component reference](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary).
- **P** — [legacy React docs — Error Boundaries](https://legacy.reactjs.org/docs/error-boundaries.html) — still the canonical explanation of what is and is not caught (not event handlers, not async, not SSR).
- **S** — [LogRocket — React error handling with react-error-boundary](https://blog.logrocket.com/react-error-handling-react-error-boundary/).
- **T** — [OneUptime — Implementing error boundaries](https://oneuptime.com/blog/post/2026-01-15-react-error-boundaries/view) · [OneUptime — How to handle error boundaries](https://oneuptime.com/blog/post/2026-01-24-handle-error-boundaries-react/view) · [Viprasol — React Error Boundaries in 2026](https://viprasol.com/blog/react-error-boundaries/) · [TatvaSoft](https://www.tatvasoft.com/outsourcing/2025/02/react-error-boundary.html) · [Medium — complete guide](https://medium.com/@rajeevranjan2k11/error-handling-in-react-apps-a-complete-guide-to-error-boundaries-and-best-practices-094aa0e4a641) · [techoral](https://techoral.com/react/react-error-boundaries.html).

Consensus placement rule worth adopting: **one boundary per independently
recoverable widget** — not one per component (fallback soup), not one for the
whole app (a blank page and a lost session).

## 8. Accessibility

12 files with `aria-*` but **0 `htmlFor` and 0 `useId`** — the intent is there,
the labelling is not.

- **P** — [react.dev — `useId`](https://react.dev/reference/react/useId) — the supported way to link a label to an input without colliding ids.
- **P** — [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) ([npm](https://www.npmjs.com/package/eslint-plugin-jsx-a11y)) — static a11y checks on JSX; not installed here.
- **S** — [rtCamp handbook — React Accessibility Best Practices](https://rtcamp.com/handbook/react-best-practices/accessibility/).
- **S** — [BrowserStack — React Accessibility: Complete Guide](https://www.browserstack.com/accessibility-testing/techniques/react-accessibility).
- **S** — [freeCodeCamp — Responsive and accessible UI with React and semantic HTML](https://www.freecodecamp.org/news/build-responsive-accessible-ui-with-react-and-semantic-html/).
- **T** — [Medium — Mastering Accessibility in ReactJS](https://medium.com/@sajjadjavadi/mastering-accessibility-in-reactjs-deep-dives-into-aria-semantic-components-and-best-practices-25ae6f30daf3) · [Medium — Accessibility in React](https://medium.com/@ignatovich.dm/accessibility-in-react-best-practices-for-building-inclusive-web-apps-906d1cbedd27) · [Accesstive — ARIA best practices](https://accesstive.com/blog/aria-best-practices-and-examples/) · [OneUptime — accessible forms with ARIA](https://oneuptime.com/blog/post/2026-01-15-accessible-forms-react-aria/view) · [UXPin — components for screen readers](https://www.uxpin.com/studio/blog/react-components-screen-reader-accessibility/).

Two rules the sources agree on and that this codebase would fail today:
semantic element before `role=`, and **ARIA state must track React state** (an
open dropdown whose `aria-expanded` says otherwise is worse than no ARIA).

## 9. Testing strategy

Not "how to write a test" — how finely a component may be split before its tests
start to hurt, and what a test is allowed to know.

- ✓ **P** — [Testing Library — About Queries / priority](https://testing-library.com/docs/queries/about/) — `getByRole` first for almost everything, `getByLabelText` for form fields, `getByTestId` explicitly last resort because the user cannot perceive it.
- **P** — [Testing Library — Guiding Principles](https://testing-library.com/docs/guiding-principles) — *carried over from the architecture skill's "not yet read" list.*
- **P** — [user-event](https://testing-library.com/docs/user-event/intro) — not currently a dependency; 0 usages.
- **T** — [BeautifulCode — Query priority in RTL](https://www.beautifulcode.co/articles/query-priority-in-react-testing-library) · [OneUptime — RTL guide](https://oneuptime.com/blog/post/2026-02-20-react-testing-library-guide/) · [openreplay — querying the DOM](https://blog.openreplay.com/query-dom-react-testing/) · [UXPin — testing React UI components](https://www.uxpin.com/studio/blog/testing-react-ui-components-best-practices/) · [Medium — RTL best practices](https://medium.com/@ignatovich.dm/best-practices-for-using-react-testing-library-0f71181bb1f4).

The best line found, worth stealing verbatim for the skill: *when `getByRole`
fails and you reach for `getByTestId`, you have discovered an accessibility
problem, not a testing limitation.* This ties §8 and §9 into one rule instead of
two.

## 10. TypeScript at the component boundary

- **P** — [React TypeScript Cheatsheet — Typing Component Props](https://react-typescript-cheatsheet.netlify.app/docs/basic/getting-started/basic_type_example/).
- **S** — [Variant — A better way to type React components](https://blog.variant.no/a-better-way-to-type-react-components-9a6460a1d4b7) — the case against `React.FC`.
- **S** — [Steve Kinney — Complete guide to component props with TypeScript](https://stevekinney.com/courses/react-typescript/component-props-complete-guide).
- **S** — [LogRocket — Typing React children correctly](https://blog.logrocket.com/react-children-prop-typescript/).
- **T** — [CoreUI — How to type props](https://coreui.io/answers/how-to-type-props-in-react-with-typescript/) · [OneUptime — typing props, state, hooks](https://oneuptime.com/blog/post/2026-01-15-type-react-props-state-hooks-typescript/) · [Medium — TS with React 2026](https://medium.com/@mernstackdevbykevin/typescript-with-react-best-practices-2026-78ce4546210b).

Candidate rules: no `React.FC`; discriminated unions for mutually exclusive
props so bad combinations are unrepresentable; `ReactNode` for children. The
discriminated-union point is the one that actually prevents bugs — the rest is
style, and style rules without a linter are noise.

## 11. React 19 APIs — researched, likely *not* adopted

Recorded so the next revision does not re-research it. `useActionState`,
`useOptimistic` and `useFormStatus` are form- and Server-Action-shaped, and this
client has **zero forms and zero Server Actions** by deliberate architecture
decision. `useOptimistic` outside a form still needs a transition.

- **P** — [React v19 release notes](https://react.dev/blog/2024/12/05/react-19).
- **T** — [Medium — Deep dive into React 19's hooks](https://medium.com/@rohitkuwar/deep-dive-into-react-19-s-latest-hooks-use-useactionstate-useoptimistic-and-useformstatus-849395af9c11) · [Manuel Sanchez — exploring the new hooks](https://manuelsanchezdev.com/blog/react-19-new-hooks-useoptimistic-useformstatus-useactionstate/) · [codefinity — useOptimistic](https://codefinity.com/blog/React-19-useOptimistic) · [200OK — new hooks](https://www.200oksolutions.com/blog/exploring-react-19-new-hooks/).

Same for **forms**: researched, then dropped once the baseline showed `<form` = 0.
Kept only as a pointer for the day a form appears — [React Hook Form advanced usage](https://react-hook-form.com/advanced-usage) (**P**), [the complete RHF guide 2026](https://tomodahinata.com/en/blog/react-hook-form) (**S**).

## 12. Not yet read

Read before `SKILL.md` is written, not after.

- **P** — [TanStack Query — Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) and [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) — *third time this has been deferred; it is the most overdue item across both skills.*
- **P** — [react.dev — `<StrictMode>`](https://react.dev/reference/react/StrictMode) — already on in `next.config.mjs`; the double-render contract should be stated since it is how effect bugs surface here.
- **P** — [react.dev — `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) — the sanctioned alternative to subscribe-in-an-effect.
- **P** — [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) — the actual source for keyboard interaction patterns, rather than the second-hand a11y posts above.

---

## Open questions for the skill's design

1. **The memoization rule is blocked on a decision.** With no React Compiler,
   advice splits: keep hand-memoizing (and then `React.memo` = 0 is a bug, since
   the `useCallback`s stabilize props nothing is comparing), or enable the
   compiler and delete most of it. That is an ADR, and the skill should point at
   it rather than pretend either answer is settled.
2. **No ESLint means no floor.** Several sections above have an official plugin
   that would enforce them mechanically. A skill restating what a linter could
   check is the expensive way to do it — consider whether the first deliverable
   is `eslint.config.mjs`, with the skill covering only what a linter cannot
   judge.
3. **Overlap to police:** derived state (§3) and custom-hook naming (§5) brush
   against the architecture skill. Both skills loading rules on the same topic
   is the duplication anti-pattern in slower motion.
