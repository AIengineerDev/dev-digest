---
name: onion-architecture
description: Enforce the onion/ports-and-adapters layering in server/ — which file a piece of backend code belongs in, which direction imports may point, when a module earns a service layer, who owns transactions and error translation, and how a new external dependency becomes a port. Use BEFORE adding a route, service, repository, or adapter under server/src, before wiring anything into the DI container, and when `pnpm arch` fails. Backend only; the client's layering lives in frontend-ui-architecture.
version: 1.4.0
---

# Onion architecture

The backend already has this shape — ports in the core, adapters at the edge, a
single composition root. This skill writes it down and keeps it. It is not a
migration plan and does not ask you to restructure working modules.

Rules here are enforced by `server/.dependency-cruiser.cjs` and run with
`pnpm arch`. Sources behind each rule are in [`README.md`](README.md).

## The dependency rule

> **Imports point inward only.** `routes` → `service` → `repository` / adapters.
> Never outward, never skipping a layer.

That is the whole architecture. Everything below is this sentence applied.

```
  routes.ts        driving adapter — HTTP, Zod schemas, status codes
  ├── service.ts   application — use cases, orchestration, transactions
  │   └── helpers.ts · constants.ts · @devdigest/shared   domain — pure rules, types, PORTS
  ├── repository.ts        driven adapter — Drizzle, SQL, table rows
  └── src/adapters/**      driven adapters — GitHub, git, LLM, secrets

  src/platform/container.ts — composition root, the only place concrete meets interface
```

**`repository.ts` is an edge, not a bottom.** In classic layering the database
sits underneath and everything depends on it. Here it is an outward adapter, the
same as the GitHub client. This is the one idea that separates onion from "three
layers", and the one most often got wrong.

## Where does it go?

| You are adding | It goes in | It may import |
| --- | --- | --- |
| An HTTP endpoint | `modules/<m>/routes.ts` | its service, `@devdigest/shared` |
| A use case: several steps, several collaborators | `modules/<m>/service.ts` | repositories, container ports, helpers |
| A SQL read or write | `modules/<m>/repository.ts` or `repository/<x>.repo.ts` | `db/**`, `@devdigest/shared` |
| A pure rule or transformation | `modules/<m>/helpers.ts` | `@devdigest/shared`, constants — **nothing else** |
| A magic value or default | `modules/<m>/constants.ts` | nothing |
| Talking to a new external system | port in `@devdigest/shared` + impl in `src/adapters/<name>/` | whatever it needs |
| Wiring an adapter | `src/platform/container.ts` | everything — this is the only such file |
| A cross-cutting mechanism (jobs, SSE, errors, config) | `src/platform/` | ports, not modules |

Anything shared by two modules goes to `@devdigest/shared`, `modules/_shared/`,
or through the container. Never import another module's internals.

## When a module needs a service

Do **not** add a service that forwards one call to a repository. An empty layer
costs indirection and buys nothing — this is the standard way onion projects
fail.

Add `service.ts` when the operation does **more than one** of:

- touches a second repository,
- calls an adapter (GitHub, LLM, git, embedder),
- applies a rule that is not shape validation,
- controls a transaction.

Otherwise `routes.ts` → `repository.ts` is a finished module, not debt. Four
modules here are deliberately two-layer on this basis: `polling`, `pulls`,
`settings`, `workspace`.

## A module is not a module until it is registered

`src/modules/index.ts` is a **static registry**: one import plus one entry per
module. Nothing autoloads. A `modules/<m>/routes.ts` that exports a perfectly
good Fastify plugin and is not named there is dead code — the routes are never
mounted, every request to them 404s, and nothing in the package fails. Not the
type-check, not `pnpm arch`, not the unit suite.

This is the one failure in this skill's scope that **passes every gate**, which
is exactly why it needs a rule of its own rather than a mention.

**Adding a module means touching two files, always:**

1. `modules/<m>/routes.ts` — `export default async function <m>Routes(app)`.
2. `modules/index.ts` — the import line and the entry in `modules`.

The same shape applies to anything else that only works once it is named in a
file every feature edits: a hook in its barrel, a message key in the locale
file, an arch rule the module's own spec claims as enforcement. Those files
merge cleanly from any branch, so the omission survives review and shows up as
a 404 in a rebuilt branch.

**When reviewing a diff that adds a module**, the registry entry is the first
thing to look for, and its absence is a blocker rather than a note: the feature
does not run at all. Read it as inert, not as incomplete.

## Ports and adapters

A new external dependency becomes a **port** when the core needs to name it and
tests need to replace it. The port is a TypeScript interface in
`@devdigest/shared`; the implementation is a class in `src/adapters/<name>/`;
the container constructs it; everyone else receives the interface.

It stays an ordinary module — no port — when it is a stateless function with no
credentials and no network: `adapters/astgrep`, `adapters/tokenizer`,
`adapters/git/diff-parser`, `adapters/codeindex/extract` are all in this
category and may be imported directly.

The test for which one you have: *would a test ever want to swap this out?* If
yes, it is a port. If it is a pure function, a test just calls it.

### An adapter never imports from a module

Adapters are **driven**: the core names them, they do not name the core. So
`src/adapters/**` may import `@devdigest/shared`, `src/platform/**` and other
adapters — and never `src/modules/**`, in either direction of intent. Not a
type, not a constant, not a helper.

The tempting case is a constant. A delivery adapter wants the module's
`DELIVERY_TIMEOUT_MS` or `MAX_ATTEMPTS` instead of duplicating the number, and
reaching for it reads like ordinary DRY. It is the wrong direction: the adapter
now cannot be constructed, tested, or reused without the feature that happens to
use it today, and the module can no longer change its own constant without
reaching into the edge.

The fix is always one of two:

- the value belongs to the **caller** — the module passes it in, as an argument
  or a constructor option, and the adapter carries its own default;
- the value is genuinely shared — it moves to `@devdigest/shared`.

**No `pnpm arch` rule catches this today.** `no-cross-module-internals` only
governs `modules/**` → `modules/**`; nothing constrains `adapters/**` →
`modules/**`. Check it by reading the import block of every file added under
`src/adapters/`, and treat a hit the way this skill treats any promise that only
a reviewer enforces: report it, and add the rule.

### An adapter's own timeout sits strictly below the job timeout

An adapter that can block — LLM, GitHub, git, HTTP — carries its own timeout,
and that number is **not free to choose**. `JobRunner` kills a handler at
`DEFAULT_JOB_TIMEOUT`, 300s (`src/platform/jobs.ts`). An adapter timeout equal
to or above it means the two race: the job is killed at the same instant the
adapter would have failed, so the run dies with a generic job timeout instead of
the adapter's error, and every per-provider branch downstream — retry, fallback,
the message the user reads — never runs.

The existing LLM adapters sit at 240s for exactly this reason, and both files
say so at the constant. A new blocking adapter must pick a number **below 300s**
and say why at the definition, or raise `DEFAULT_JOB_TIMEOUT` deliberately in
the same commit.

This is invisible in review unless you know the number. `300_000` in a new
adapter reads like a sensible five-minute ceiling; it is the one value that
guarantees the error is swallowed.


Never import a port's concrete class outside `container.ts`. That is what
`src/adapters/mocks.ts` and `ContainerOverrides` exist for.

## Transactions

The **service** owns the transaction boundary, because only the service knows
which writes must succeed together. Repositories accept the transaction handle
and do not open one. Drizzle's `tx` has the same shape as `db`, so a repository
method takes it as a parameter rather than reaching for a global.

A transaction must never be visible in `routes.ts`. If a route needs to know
that two writes were atomic, the use case belongs in a service.

## Errors

Translate at the boundary, in this direction:

1. `repository.ts` turns database failures into domain errors from
   `src/platform/errors.ts`. A `constraint violation` string must not escape it.
2. `service.ts` throws domain errors and knows nothing about HTTP.
3. `routes.ts` is the only layer that names status codes. Zod schemas from
   `@devdigest/shared` reject invalid input with `422` before a handler runs —
   never hand-roll `Schema.parse(req.body)`.

## What this skill does not do

- No DDD aggregates, value objects, or rich domain models. Our data is Drizzle
  rows and Zod types; the anemic model is a deliberate fit for this domain.
- No restructuring of `@devdigest/shared`. Note that it currently holds two
  different things — DTO contracts and port interfaces. That is accepted, not
  overlooked.
- Nothing about `reviewer-core`: it is already a pure engine with no I/O.
- Nothing that `server/AGENTS.md` already covers (commands, migrations, route
  schemas).

## A cost guarantee is a build rule, not a review comment

When a feature promises the user something about what it *costs* — this opens
instantly, this never calls a model, this reads only what is already stored —
that promise has to become a `dependency-cruiser` rule in the same PR.

`smart-diff-spends-nothing` is the pattern to copy: it forbids
`modules/smart-diff/**` from importing `src/adapters/llm`, `reviewer-core` or
`modules/reviews`. Its comment says why in one line — "a product promise, so it
is a build failure and not a review comment".

The reasoning generalises: a guarantee that only a reviewer enforces is not
enforced. The code satisfying it today proves nothing about the code six months
from now, when someone adds one import to fix a rendering gap and no gate
objects. **A PR that states a cost guarantee and adds no rule is incomplete even
when every line in it is correct** — and that is the case worth catching,
because nothing about it looks wrong.

Read the PR description, the module's doc comment and its route comments for the
promise. If one is there, look for the rule; if the rule is missing, that is the
finding.

## Enforcement

```sh
pnpm arch        # fails on NEW violations only
pnpm arch:all    # shows everything, including the 11 known ones
```

Most rules restate a sentence above. One does not: `smart-diff-spends-nothing`
forbids `modules/smart-diff/**` from importing the LLM adapter, `reviewer-core`
or `modules/reviews`. It is there because "opening a diff is free" is a promise
to the user, and a promise that only a code reviewer enforces is not enforced.
A feature with a cost guarantee may add a rule of the same shape.

Known violations are recorded in `.dependency-cruiser-known-violations.json`.
**Never regenerate that file to silence a failure.** Fix the import, or change
the rule deliberately in the same commit as the skill.

Baseline as of 2026-08-09 — 11 violations, all pre-existing:

| Rule | Count | What it is |
| --- | --- | --- |
| `no-circular` | 5 | Cycles through `container.ts` ↔ `repo-intel` service and pipeline; one local `agents/helpers ↔ repository` |
| `routes-no-db` | 4 | `polling`, `pulls`, `settings`, `workspace` reach `db/schema` from the route |
| `helpers-are-pure` | 1 | `repos/helpers.ts` imports `db/schema` |
| `no-cross-module-internals` | 1 | `repos/service.ts` imports `repo-intel/constants.ts` |

These are not precedent. Fix one when you are already in the file, and drop it
from the baseline in the same commit.

## Before you finish

1. `pnpm arch` passes.
2. No new file imports across a layer boundary or into another module's internals.
3. Any new external system is a port in `@devdigest/shared`, constructed only in
   `container.ts`.
4. No service was added that only forwards to a repository.
5. A new module was added to the registry in `src/modules/index.ts` — an import
   line and an entry. Without it the routes are never mounted.
6. No file added under `src/adapters/` imports from `src/modules/` — not a type,
   not a constant. `pnpm arch` does not check this one.
7. Any new blocking adapter's timeout is strictly below `DEFAULT_JOB_TIMEOUT`
   (300s), with the reason at the constant.
8. Any cost guarantee the PR states is enforced by a `dependency-cruiser` rule
   added in the same PR.
9. Transactions open in a service, not in a route or a repository.
10. Database errors were translated before leaving the repository.
11. `pnpm typecheck` passes.

---

## Version history

| Version | Change |
| --- | --- |
| 1.4.0 | Adds **`adapters/**` may not import `modules/**`** — the one cross-module direction no `dependency-cruiser` rule covers (`no-cross-module-internals` governs `modules/**` → `modules/**` only), and the one that reads like ordinary DRY when it is a constant. |
| 1.3.0 | Adds two checks that a reviewer cannot reach by general reasoning: an adapter timeout must sit strictly **below** `DEFAULT_JOB_TIMEOUT` (300s) or the job kills the handler at the same instant and swallows the adapter's error (`src/platform/jobs.ts:43`), and a stated **cost guarantee** must ship a `dependency-cruiser` rule in the same PR, after `smart-diff-spends-nothing`. |
| 1.2.0 | Adds **module registration** — `src/modules/index.ts` is a static registry, and an unregistered module is inert while passing typecheck, `pnpm arch` and the unit suite. Recorded in root `INSIGHTS.md` (2026-08-16) after Smart Diff shipped its registration on a different branch and returned 404 when rebuilt alone. |
| 1.1.0 | Adds `smart-diff-spends-nothing` — the first feature-specific rule, enforcing a cost guarantee rather than a layer boundary. |
| 1.0.0 | First version. Names the layering already present in `server/src`, adds the enforced rule set (`.dependency-cruiser.cjs`, `pnpm arch`) with a baseline of the 11 violations measured 2026-08-09, and sets the criterion for when a module earns a service layer. |
