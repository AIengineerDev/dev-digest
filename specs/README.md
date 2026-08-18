# specs/ — cross-package

Forward-looking specs for work that spans more than one package. One file per
feature: `NN-feature-name.md`. Work that lives inside a single package goes in
that package's `specs/` instead.

A spec describes **what to build and why it is done** — not how the code works
today (that is `docs/`), not what we already rejected (that is `INSIGHTS.md`),
and not the order the work happens in (that is `plans/`).

Minimum shape:

```markdown
# <Feature>

**Status:** draft | agreed | in progress | shipped
**Packages touched:** server, client

## Problem
## Scope — in / out
## Contract changes        <!-- @devdigest/shared first, always -->
## Acceptance criteria     <!-- how we know it is done -->
## Open questions
```

The real specs here are longer than that, and deliberately: `04-intent-layer.md`
adds *Decisions — do not re-open these* and *Traps*, `07-smart-diff.md` adds
*Thresholds*. Extend the shape when the feature needs it; never drop a section
from the minimum.

## Written by `specreator`

The [`specreator`](../.claude/agents/specreator.md) agent is the author. It
**creates** spec files and can write nowhere else — a `PreToolUse` hook enforces
that, including a block on overwriting a file that already exists. So:

- **Revising an agreed spec is a new numbered file** that names what it
  supersedes, not an edit. A human may still edit one by hand; the agent may not.
- Its output extends the shape above with numbered `## Requirements`, a design
  analysis (states the mockup does not cover, divergence from `client/` today),
  `## Non-functional requirements`, `## Corner cases`, and a `## Could not
  establish` section. Every row traces to a requirement id.
- Designs come from [`design-mocks/`](../design-mocks/), not from images pasted
  into a chat — a subagent cannot see those.

Once shipped, either delete the spec or set `Status: shipped` and move any
durable explanation into `docs/`. Stale specs are worse than missing ones — an
agent reads them as current intent.
