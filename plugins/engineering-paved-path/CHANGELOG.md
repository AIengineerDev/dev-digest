# Changelog — Engineering Paved Path

Every release records what a consumer needs to decide whether to take it: the
artefacts that appeared or disappeared, and **any change to a `description`
field**. A description is what routes a skill or an agent, so a routing change is
invisible in a body diff and is the change most likely to break someone else's
session.

Releases are tagged `engineering-paved-path--v{version}`.

## 1.0.0 — 2026-08-29

First release.

**Skills added**
- `onion-architecture` (1.2.0) — backend layering. Ships an eval suite.
- `frontend-ui-architecture` (1.1.0) — frontend placement and routing.
- `repo-conventions` (1.0.0) — repository process no gate catches. Ships an eval suite.
- `dependency-checker` (1.0.0) — external dependency audit, with a survey script.
- `engineering-insights` (1.0.0) — recall and record durable lessons.

**Descriptions changed** — all five were de-projectised before this release:
repository-rooted paths, the originating project's name, and its package aliases
were replaced with neutral equivalents. Routing phrases were left untouched, so
the skills answer the same questions they did before.

**Dependencies** — none.
