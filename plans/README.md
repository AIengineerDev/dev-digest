# plans/ — how a spec gets built

One file per feature: `NN-<feature>.plan.md`, where `NN` is the number of the
spec it came from. `specs/07-smart-diff.md` → `plans/07-smart-diff.plan.md`.
The matching number is the whole point: it is how a reader finds the intent
behind a plan, and the plan behind an intent.

A plan describes **how the work gets done and how we know each step is green** —
not what to build or why (that is `specs/`), not how the system works today
(that is `docs/`), and not what we already rejected (that is `INSIGHTS.md`).

Written by the `implementation-planner` agent, which is read-only: it returns the
plan as text and the main session saves it here. Verified afterwards by
`plan-verifier`, which needs this file to exist — a plan that lived only in a
session transcript cannot be checked against the code that claims to implement it.

Two shapes, depending on the execution mode the planner asked about:

- **`## Phases`** — one implementer, sequential. Each phase ends with the gates
  green.
- **`## Tracks`** — parallel agents, each owning a disjoint set of files, with
  contracts landed before the fan-out and named synchronisation points.

## `NN-<feature>.run.md` — the run journal

Beside each plan, the `/impl` skill keeps a run file with the same number: which
stages are done, which fix-loop round the review is on, the findings still open,
and every decision a human made at a gate. It exists because the chain is
meant to run across several chats and a subagent starts with an empty context —
without it, a fresh session cannot tell what has already happened.

It is a journal, not an artifact. Delete it when the run ships.

Once the work has shipped, delete the plan or mark it `shipped`. A stale plan is
read as current intent by the next agent, which is worse than no plan at all.
