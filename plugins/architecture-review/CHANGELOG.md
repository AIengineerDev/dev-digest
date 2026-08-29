# Changelog — Architecture Review

Every release records what a consumer needs to decide whether to take it: the
artefacts that appeared or disappeared, and **any change to a `description`
field**. A description is what routes a skill or an agent, so a routing change is
invisible in a body diff and is the change most likely to break someone else's
session.

Releases are tagged `architecture-review--v{version}`.

## 1.0.0 — 2026-08-29

First release.

**Agent added**
- `architecture-reviewer` — read-only boundary review with file-and-line evidence.

**Behaviour changed since it ran as a local agent**
- It now **invokes** `onion-architecture` and `frontend-ui-architecture` as
  skills instead of reading their `SKILL.md` files by repository path. An
  installed plugin cannot read outside its own directory, so the old form would
  have failed silently on every machine but the one it was written on.
- Gained the `Skill` tool, which that change requires.

**Dependencies** — `engineering-paved-path` `^1.0`. The rule sets it judges
against live there; without them it has nothing to judge against.
