# Changelog — SDD Engineering

Every release records what a consumer needs to decide whether to take it: the
artefacts that appeared or disappeared, and **any change to a `description`
field**. A description is what routes a skill or an agent, so a routing change is
invisible in a body diff and is the change most likely to break someone else's
session.

Releases are tagged `sdd-engineering--v{version}`.

## 1.0.0 — 2026-08-29

First release.

**Agents added**
- `spec-creator` — writes specifications only, fenced by a `PreToolUse` hook.
- `implementation-planner` — spec to plan, with real gate commands per phase.
- `implementer` — executes a plan phase by phase.
- `plan-verifier` — one evidenced verdict per stated item.
- `doc-writer` — documents what merged.

**Skills added**
- `impl` — drives build → verify → review → accept → ship, resumable.
- `workflow-retro` — measures a finished run and proposes prompt changes.

**Hook added**
- `spec-creator-guard` — wired through this plugin's own `hooks/hooks.json` on
  `PreToolUse`, resolving through `${CLAUDE_PLUGIN_ROOT}`. The fence travels with
  the agent set; an agent set that ships without the hook that bounds it is one
  whose stated guarantees are false.

**Behaviour changed since these ran as local agents**
- `implementation-planner` now invokes governing skills instead of reading their
  files by path, and gained the `Skill` tool to do it.
- Script invocations inside `impl` and `workflow-retro` resolve through
  `${CLAUDE_PLUGIN_ROOT}` instead of a repository-rooted path.
- Descriptions de-projectised; routing phrases unchanged.

**Dependencies**
- `engineering-paved-path` `^1.0` — the governing skills each build phase applies.
- `architecture-review` `^1.0` — stage 3 of the chain spawns `architecture-reviewer`.

**Known risk, not yet resolved.** The `spec-creator` fence keys on the hook
payload's `agent_type`. Whether a plugin-provided subagent presents as
`spec-creator` or under a namespaced name is unverified, and the guard currently
allows any agent it does not recognise. Verify on a real install before relying
on the fence.
