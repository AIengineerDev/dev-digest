---
name: onion-architecture
description: Enforce the onion/ports-and-adapters layering in server/ — which file a piece of backend code belongs in, which direction imports may point, when a module earns a service layer, who owns transactions and error translation, and how a new external dependency becomes a port. Use BEFORE adding a route, service, repository, or adapter under server/src, before wiring anything into the DI container, and when `pnpm arch` fails. Backend only; the client's layering lives in frontend-ui-architecture.
version: 1.0.0
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

## Enforcement

```sh
pnpm arch        # fails on NEW violations only
pnpm arch:all    # shows everything, including the 11 known ones
```

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
5. Transactions open in a service, not in a route or a repository.
6. Database errors were translated before leaving the repository.
7. `pnpm typecheck` passes.

---

## Version history

| Version | Change |
| --- | --- |
| 1.0.0 | First version. Names the layering already present in `server/src`, adds the enforced rule set (`.dependency-cruiser.cjs`, `pnpm arch`) with a baseline of the 11 violations measured 2026-08-09, and sets the criterion for when a module earns a service layer. |
