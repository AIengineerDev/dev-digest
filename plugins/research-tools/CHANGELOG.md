# Changelog — Research Tools

Every release records what a consumer needs to decide whether to take it: the
artefacts that appeared or disappeared, and **any change to a `description`
field**. A description is what routes a skill or an agent, so a routing change is
invisible in a body diff and is the change most likely to break someone else's
session.

Releases are tagged `research-tools--v{version}`.

## 1.0.0 — 2026-08-29

First release.

**Agent added**
- `researcher` — evidence-backed answers from the repository or the web, read-only.

**Dependencies** — none, deliberately. The agent has no `Skill` tool, so a
dependency on the paved-path skills would install five skills it could never
invoke and that you would then be blocked from disabling.
