# Engineering Paved Path

Five skills that answer the questions a code review keeps asking and no linter
can settle: **where does this code go, what must never be committed, what is this
dependency costing us, and what did we already learn the hard way?**

A paved path is not a rule book. It is the route that is easiest to take, so that
doing the right thing costs less than doing the wrong one.

## Install

```
/plugin marketplace add AIengineerDev/dev-digest
/plugin install engineering-paved-path@devdigest-tools
```

Usable on its own. It is also a dependency of `sdd-engineering` and
`architecture-review`, so installing either brings it along.

## The five skills

| Skill | Ask it when | It will not |
| --- | --- | --- |
| `onion-architecture` | Before adding a route, service, repository or adapter to a backend; when your import-direction gate fails | Judge the frontend |
| `frontend-ui-architecture` | Before creating a component, deciding a folder, splitting something that grew, or turning a view into a route | Judge styling, performance or tests |
| `repo-conventions` | Before committing across more than one package; when a diff touches a lockfile, a migration, a vendored copy, a symlink or a CI baseline | Judge layering — that is the two above |
| `dependency-checker` | Before adding a runtime dependency; when the install or the bundle got heavy; on a dependency-bump PR | Judge internal import direction |
| `engineering-insights` | At the **start** of a non-trivial task, to recall what was already tried; at the **end**, to record what was learned | Restate what the code already says |

They delimit each other deliberately. Each description names the neighbour it
defers to, so the wrong skill hands you to the right one instead of guessing.

## The two that change how a team works

**`engineering-insights`** maintains an `INSIGHTS.md` per module: the decisions,
the rejected approaches, and the failure modes that cost someone an afternoon.
Code says *what*; these files say *why*, and *what not to try again*. It is
append-only by construction and it dedupes before writing, so the file stays
short enough that reading it is not a chore.

**`repo-conventions`** covers the class of mistake that passes every gate — a
generated file hand-edited, a symlink replaced by a copy, the wrong package
manager in a package with its own lockfile. Nothing catches these, and the damage
surfaces days later in someone else's branch.

## Adapting it to your repository

The architecture skills were written against a specific stack — a Fastify/Drizzle
backend and a Next.js frontend — and their examples name real directories and
real gate commands. **Read them as worked examples, not as universal law.** The
shape of the argument transfers; the paths will not.

Two of the five ship with eval suites (`onion-architecture` and
`repo-conventions`), so their behaviour is measured rather than asserted. The
other three do not yet.

## Invoking

Each is a normal skill: name it, or let the model route to it from its
description. `dependency-checker` also ships a survey script it runs for you —
it resolves its own path through `$CLAUDE_PLUGIN_ROOT`, so it works wherever the
plugin is installed.
