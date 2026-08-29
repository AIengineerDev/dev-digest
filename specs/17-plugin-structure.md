# Plugin structure — carving this repo into Claude Code plugins and publishing the marketplace

**Status:** draft
**Packages touched:** repo root only — new `.claude-plugin/`, new `plugins/`,
plus `scripts/release.sh`, `scripts/marketplace-verify.mjs`,
`scripts/build-catalog.mjs`, `.github/workflows/marketplace.yml`, and prompt-text
edits inside `.claude/agents/**` and `.claude/skills/**`. No application package
is touched.
**Design source:** none. This feature has no UI; `design-mocks/` has nothing for
it. The "design analysis" section below is replaced by an install-lifecycle state
analysis, because that is where the undrawn states actually live.
**Supersedes:** nothing.
**Borders on:** `specs/16-marketplace-catalog-site.md`. That spec owns the
**catalog site** and reads `plugins/*/.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json` as inputs; this spec owns **producing** them.
The line: spec 16 never decides what a plugin contains, this spec never decides
how it is displayed. It also borders on root `INSIGHTS.md` *2026-08-29* (release
and rollback shape), which this spec extends but does not re-open.

---

## Problem

The repository has 22 shippable agent artefacts — 7 skills, 8 agents, 1 hook,
5 MCP tools, 1 product skill (`node scripts/build-catalog.mjs --report`, counts
confirmed 2026-08-29) — and no way for anyone to install any of them.
`.claude-plugin/marketplace.json` does not exist; `plugins/` does not exist.
Three things already assume they will:

1. `scripts/marketplace-verify.mjs:54-60` exits 0 with "this repository is not a
   marketplace yet — this gate is inert until then".
2. `scripts/release.sh:50-52` refuses to release for the same reason.
3. `scripts/build-catalog.mjs:290-296` emits "no marketplace manifest yet — no
   artefact can be attributed to a plugin, and no install command can be
   produced", so every artefact in the catalog has `plugin: null`.

The hard part is not the manifests. It is that **these files are live**: this
repository loads its own daily working configuration from `.claude/agents/` and
`.claude/skills/`, and `.gitignore:37-41` commits exactly those four paths on
purpose, with the reason stated at `.gitignore:28-36`. Anything that puts a
second copy of an agent or a skill in `plugins/` creates the failure the repo has
already paid for once: root `INSIGHTS.md:426-442` records that the two vendored
copies of `@devdigest/shared` drifted, that nothing failed when only one was
edited, and that five files now disagree.

---

## Scope — in / out

**In:** the four plugins and their contents; the single-source-of-truth
mechanism; `.claude-plugin/marketplace.json`; per-plugin dependency declarations;
where the `spec-creator` fence lives after distribution; per-plugin version lines
and the tag convention; the gate and CI changes that make all of the above
checkable.

**Out**, each with its reason:

| Out | Reason |
| --- | --- |
| Publishing the MCP server or the product skill (`skills/api-contract-reviewer/`) as plugins | Different shape and different consumer. `mcp/AGENTS.md` owns the MCP tool budget; the product skill is application data (`specs/02-skills.md`) |
| Changing what any agent or skill *does* | This spec repackages. The one exception is stated as a requirement (R6) because distribution breaks the reference |
| The catalog site's rendering of plugins | `specs/16-marketplace-catalog-site.md` |
| Enterprise/managed distribution, release channels, `strictKnownMarketplaces` | No second audience exists yet |
| Cross-marketplace dependencies | Every plugin here lives in this one repo. `allowCrossMarketplaceDependenciesOn` stays absent (Claude Code plugin documentation) |
| Rewriting `scripts/rollback.sh` | Its forward-only shape is settled — root `INSIGHTS.md:19-40` |

---

## The structural decision — plugin directories are symlinks into `.claude/`

**Chosen: shape (a).** `plugins/<name>/agents/*.md` and
`plugins/<name>/skills/<name>/` are **symlinks into the committed `.claude/`
tree**. This repository keeps loading from `.claude/` exactly as it does today,
and install dereferences the symlink and copies the target's content into the
cache (Claude Code plugin documentation: a symlink inside a plugin directory
targeting a file elsewhere in the same marketplace is dereferenced at install —
this is the documented mechanism for a plugin's `skills/` to link to skills
defined elsewhere in the marketplace).

Why this and not the others:

- **(b) — move the files into `plugins/` and make `.claude/` the symlinks.**
  Rejected on risk asymmetry. Under (a) a broken link breaks the *published*
  plugin, and the marketplace gate and the install smoke test (R11, R13) catch it
  before a user does. Under (b) a broken link breaks **this repo's own agent
  loading**, for everyone, every day, and nothing in CI exercises the loader.
  It also inverts `.gitignore:28-41`, whose allowlist and its stated rationale
  are written around `.claude/skills/`, `.claude/agents/`, `.claude/hooks/` and
  `.claude/settings.json` being the shared, committed things.
- **(c) — physical copies plus a sync check.** Rejected: it is the
  `@devdigest/shared` failure by construction (root `INSIGHTS.md:426-442` — "there
  is no sync script and nothing fails when you edit only one"), and
  `repo-conventions` (`.claude/skills/repo-conventions/SKILL.md:3`) exists
  precisely to catch "a vendored copy, a symlink" replaced by a duplicate.

Audit of shape (a) against this repo:

- **Symlinks are already house practice and already governed.** `AGENTS.md` is
  the real file and `CLAUDE.md` is a symlink to it in every package; root
  `CLAUDE.md` states "never replace the symlink with a copy, or the two will
  drift", and `repo-conventions` is the gate for it. Shape (a) inherits that
  enforcement instead of inventing one.
- **`.gitignore` does not break it.** `plugins/` and `.claude-plugin/` appear
  nowhere in `.gitignore` (checked 2026-08-29); the symlink *targets* are the
  four allowlisted paths at `.gitignore:38-41`. Git stores the links themselves.
- **The catalog generator still attributes correctly.**
  `scripts/build-catalog.mjs:303-307` attributes an artefact to a plugin by
  reading directory entry **names** under `plugins/<x>/{skills,agents,commands,hooks}`
  and stripping the extension. A symlink named `spec-creator.md` attributes
  identically to a file.

---

## Requirements

| ID | Requirement | Source |
| --- | --- | --- |
| R1 | Four plugins exist under `plugins/`: **`sdd-engineering`** (agents `spec-creator`, `implementation-planner`, `implementer`, `plan-verifier`; skills `impl`, `workflow-retro`; the `spec-creator` fence), **`research-tools`** (agent `researcher`), **`architecture-review`** (agent `architecture-reviewer`), **`devdigest-standards`** (skills `engineering-insights`, `onion-architecture`, `frontend-ui-architecture`, `repo-conventions`, `dependency-checker`) | CTO decision; the split of skills is argued below |
| R2 | Every agent and skill file inside `plugins/**` is a **symlink into `.claude/`**. No plugin directory contains a second copy of any artefact body, and no artefact exists under `plugins/` that does not exist under `.claude/` | The structural decision above; root `INSIGHTS.md:426-442` |
| R3 | `devdigest-standards` is the shared dependency plugin. `sdd-engineering` and `architecture-review` declare it in `plugin.json` `dependencies` with the range **`^1.0`**. `research-tools` declares **no** dependency | Claude Code plugin documentation (`dependencies`, semver ranges, transitive install/enable); the reasoning below |
| R4 | `.claude-plugin/marketplace.json` exists with `name: "devdigest-tools"`, an `owner`, and one relative-source entry per plugin (`"./plugins/<name>"`), each carrying `name`, `source`, `description`, `version`, `category`, `tags`. `renames` is present and **empty** (`{}`), so the file that must carry a rename already exists at the moment one happens | `docs/temp/marketplace-research.md` §2; `scripts/marketplace-verify.mjs:32-38` (the reserved-name set — `devdigest-tools` is not in it) |
| R5 | `strict` stays at its default (`true`) on every entry: `plugin.json` is the authority for component definitions, and the marketplace entry may not override it | `docs/temp/marketplace-research.md` §3.4 |
| R6 | **No artefact shipped in a plugin references another artefact by repository-relative path.** References are by artefact *name*; a plugin's own sibling files are addressed through `${CLAUDE_PLUGIN_ROOT}`. The known inventory to fix: `.claude/agents/architecture-reviewer.md:18-19,72,99,185` (reads two `SKILL.md` files by path), `.claude/skills/workflow-retro/SKILL.md:54-57` (`node .claude/skills/workflow-retro/measure.mjs`), `.claude/skills/dependency-checker/SKILL.md:36-37` (`.claude/skills/dependency-checker/scripts/survey.sh`), `.claude/skills/impl/SKILL.md:25`, `.claude/agents/spec-creator.md:19`, `.claude/agents/implementation-planner.md:137`, `.claude/agents/doc-writer.md:117` | Plugin caching copies the plugin directory; nothing inside may reach outside it (Claude Code plugin documentation; `docs/temp/marketplace-research.md` §3.2) |
| R7 | `sdd-engineering` ships a `README.md` explaining how spec → plan → build → verify → review → accept → ship fits together, written for a reader with **none** of this repository's context, and a `CHANGELOG.md` separate from it | CTO decision |
| R8 | Every plugin ships a `CHANGELOG.md` recording, per release: version, date, the git tag, artefacts added / renamed / removed, **any change to a `description` field** (because a description is what routes a skill or agent, and a routing change is invisible in a body diff), and the minimum `devdigest-standards` range required | `AGENTS.md` "After changing a skill, an agent, or this file"; `evals/src/quality.ts` exists because these fail silently |
| R9 | Version lines are **independent per plugin**. A release tags `{plugin-name}--v{version}` via `claude plugin tag --push`, which validates contents, requires `plugin.json` and the marketplace entry to agree, and requires a clean tree under that plugin directory. `scripts/release.sh` must stop producing the single `marketplace-v{X.Y.Z}` tag it builds today (`scripts/release.sh:45`, `:97`, `:120-127`) and must instead release one named plugin at a time | Claude Code plugin documentation (tag naming is what lets one repo host several version lines) |
| R10 | Because every plugin here uses a **relative** source, the marketplace's commit is the plugin's commit: a change to a symlink target ships to everyone on their next marketplace update regardless of tags. A release therefore bumps `version` in `plugin.json` **and** the marketplace entry in the same commit, and a `devdigest-standards` **major** bump must land together with the dependent bumps that widen their ranges | root `INSIGHTS.md:28-35`; `scripts/release.sh:9-15` |
| R11 | `scripts/marketplace-verify.mjs` gains checks it cannot pass today: every symlink under `plugins/**` resolves to an existing committed file under `.claude/` (no dangling links, no link escaping the repo); every `dependencies` entry names a plugin in this marketplace; every declared range is satisfied by the depended-on plugin's current `version`; and no file reachable from a plugin contains a `.claude/`-rooted path string (R6) | `scripts/marketplace-verify.mjs:1-21` states this gate's job as exactly the cross-file agreement the schema cannot check |
| R12 | `.github/workflows/marketplace.yml` path filter gains `.claude/**`. Today it fires only on `.claude-plugin/**`, `plugins/**` and the script itself (`:11-21`) — under R2 the plugin content **is** `.claude/`, so editing a skill body would ship unverified | `.github/workflows/marketplace.yml:11-21` |
| R13 | An install smoke check proves the published shape actually installs: from a clean clone, add the marketplace and install each plugin, then assert `claude plugin list --json` reports an empty `errors` field — no `dependency-unsatisfied`, `range-conflict`, `dependency-version-unsatisfied` or `no-matching-tag` | Claude Code plugin documentation (errors surface in `claude plugin list --json`) |
| R14 | `scripts/build-catalog.mjs` gains a `plugin` class with a minimum count of **4**, and the `marketplace` result must be non-null once this ships. The existing `MINIMUMS` (`scripts/build-catalog.mjs:35`) are not lowered | `specs/16-marketplace-catalog-site.md` R16; `scripts/build-catalog.mjs:328-332` |
| R15 | The `spec-creator` fence travels with `sdd-engineering`: the plugin carries the hook script and a `hooks/hooks.json` wiring `PreToolUse` on `Write\|Edit\|MultiEdit\|NotebookEdit\|Bash` to `${CLAUDE_PLUGIN_ROOT}`. The repo's own `.claude/settings.json:5-13` is **not** shipped and is not changed | `.gitignore:33-36` — an agent set that travels without the hook that bounds it is a set whose stated guarantees are false |
| R16 | The fence must be proven to still fire under a plugin install **before the first publish**. It keys on the `agent_type` field of the hook payload (`.claude/hooks/spec-creator-guard.mjs:2-11`), and whether a plugin-provided subagent presents as `spec-creator` or as a namespaced name is unverified. If it presents differently the hook silently allows everything — the permissive direction. The guard must match the namespaced form too, and must **deny** rather than pass when it cannot identify the agent at all | `.claude/agents/README.md` ("Mechanical write-scoping"); Claude Code plugin documentation (`agent_type` in `PreToolUse` input) |
| R17 | Each plugin's `README.md` records where its artefacts came from — the upstream repository or the statement that it originated here — so a reader can check licence and provenance | Pending inputs, below |

### Which skills are shared, and why `devdigest-standards`

Evidence: all **seven** skill↔skill edges the generator extracts fall entirely
inside one four-skill cluster (`node scripts/build-catalog.mjs --report`,
`mentions`): `dependency-checker → {onion-architecture, frontend-ui-architecture,
repo-conventions}` (`.claude/skills/dependency-checker/SKILL.md:3`),
`repo-conventions → {onion-architecture, frontend-ui-architecture,
dependency-checker}` (`.claude/skills/repo-conventions/SKILL.md:3`), and
`onion-architecture → frontend-ui-architecture`
(`.claude/skills/onion-architecture/SKILL.md:3`). Each edge is a *boundary*
sentence — "that belongs to X, not to me". Splitting the cluster ships a skill
whose own description delegates to a skill the user does not have.

That cluster is consumed from **two** plugins: `sdd-engineering`'s `implementer`
invokes `onion-architecture` / `frontend-ui-architecture`
(`.claude/agents/implementer.md:42-43`) and `implementation-planner` names them
as governing skills (`:131-132`), while `architecture-review`'s agent judges
against those same two rule sets (`.claude/agents/architecture-reviewer.md:18-19`)
and delegates repository process to `repo-conventions` (`:3`).

`engineering-insights` joins them: root `CLAUDE.md` requires it at the end of any
non-trivial task by **any** agent, `.gitignore:29-30` gives that as the reason
the skill has to travel with the repo, and it is the only supported path into an
`INSIGHTS.md` — the reason `doc-writer` is deliberately denied the `Skill` tool
(`.claude/agents/README.md`, permissions table).

`impl` and `workflow-retro` stay in `sdd-engineering`: both are
`disable-model-invocation: true`
(`.claude/skills/impl/SKILL.md:6`, `.claude/skills/workflow-retro/SKILL.md:6`),
both are about the agent chain rather than about code, and `impl` spawns exactly
the agents that plugin ships (`.claude/skills/impl/SKILL.md:25`).

**Name.** `devdigest-standards` — it names the *content* (this repository's
placement rules, process rules, dependency policy and insight ledger), not its
position in a graph. `shared`, `common` or `core` describe a structural role that
changes the moment a second consumer appears or disappears. The `devdigest-`
prefix is honest about scope: `.gitignore:30-31` says this material "is worth no
more than the repo it was written for", and an unprefixed `engineering-standards`
would claim otherwise and collide with someone else's plugin of that name.

**`research-tools` declares no dependency**, deliberately: `researcher` has no
`Skill` tool (`.claude/agents/README.md`, the agent table), so no skill in
`devdigest-standards` is reachable from it, and a dependency that installs five
skills a user cannot invoke is noise they must then be blocked from disabling
(Claude Code plugin documentation: disabling is refused while a dependent is
enabled).

---

## Install-lifecycle states — the axes nobody draws

There is no mockup; the states below are the ones this feature actually has.

| Axis | State | Requirement |
| --- | --- | --- |
| Emptiness | A fresh user with none of these plugins; `renames` empty at publish (R4); `errors: []` as the success state (R13) | R4, R13 |
| Cardinality | One plugin installed alone (`research-tools` — the only one with no dependency) versus all four; the transitive case where installing one yields two | R3, C2 |
| Extremes | Five skills' full text pulled into a session by a single transitive install; the 8-agent set as the largest install | NFR Scale |
| Time | Install is not instant and resolves dependencies first; auto-update is **off by default** for non-Anthropic marketplaces, so a user sits on an old bundle until they run `claude plugin update` and `/reload-plugins` | C7, NFR Latency |
| Failure | `dependency-unsatisfied`, `range-conflict`, `dependency-version-unsatisfied`, `no-matching-tag`; a dangling symlink; a hook that no longer fires | C3, C4, C6, R11, R16 |
| Permission | The fence is the permission surface, and it is the one thing that does not travel by itself | R15, R16 |
| Concurrency | The marketplace's default branch moves under an installed user (relative sources have no ref of their own) | R10, C7 |
| Reachability | `/plugin marketplace add AIengineerDev/dev-digest` then `/plugin install <name>@devdigest-tools`; and the reverse — `claude plugin uninstall --prune` / `claude plugin prune` removing auto-installed dependencies while never touching a user-installed one | R4, C5 |

---

## Module interaction

| From → to | Contract | Sync? | If the far side fails | Req |
| --- | --- | --- | --- | --- |
| `sdd-engineering` → `devdigest-standards` | `plugin.json` `dependencies: [{ name, version: "^1.0", marketplace: "devdigest-tools" }]` | resolved at install, checked at load | Install refuses with `dependency-unsatisfied`; a range miss at load is `dependency-version-unsatisfied`. The plugin does **not** half-load with skills missing | R3, C3 |
| `architecture-review` → `devdigest-standards` | same | same | same. Additionally the reviewer has no rule set to judge against, which is a wrong-verdict risk, not just a missing file → R6 | R3, R6 |
| `plugins/**` → `.claude/**` | filesystem symlink, dereferenced at install | build/install time | A dangling link ships an empty plugin silently; R11 is the only thing that catches it, and R12 is what makes R11 run | R2, R11, R12 |
| `sdd-engineering` → the `spec-creator` fence | `hooks/hooks.json` + `${CLAUDE_PLUGIN_ROOT}` | per tool call | Hook missing or not matching the agent identity → the agent writes anywhere, and nothing reports it. **Fails open by default** | R15, R16 |
| `scripts/build-catalog.mjs` → `.claude-plugin/marketplace.json` | read-only, `plugins[].source` + directory listing | build time | Manifest absent → `plugin: null` on all 22 artefacts, as today | R14 |
| `scripts/release.sh` → git tags | `{plugin-name}--v{version}` | manual | Tag already exists → refuse and pick the next version | R9 |

---

## Contract changes

**None in `@devdigest/shared`.** Nothing here passes through a Zod contract.

New committed shapes owned by this spec: `.claude-plugin/marketplace.json` (R4)
and one `plugins/<name>/.claude-plugin/plugin.json` per plugin (R1, R3). One
existing shape is consumed differently: `scripts/build-catalog.mjs` gains a
`plugin` class (R14), which `specs/16` reads.

---

## Corner cases

| ID | Case | Expected behaviour | Req |
| --- | --- | --- | --- |
| C1 | A skill in `devdigest-standards` is needed by `sdd-engineering`, and the user installed only `sdd-engineering` | Installing it installs `devdigest-standards` transitively; enabling it enables the dependency **at the same scope**, writing an explicit `true` even against a `defaultEnabled: false` (Claude Code plugin documentation). The user never sees a half-configured chain | R3 |
| C2 | The user then tries to disable `devdigest-standards` while `sdd-engineering` is enabled | Refused, with the dependents named and a chained disable command offered. Documented in the `sdd-engineering` README so it reads as designed rather than as a bug | R3, R7 |
| C3 | `devdigest-standards` goes to `2.0.0` (a skill renamed or removed) while `sdd-engineering` still declares `^1.0` | Resolution fails with `dependency-version-unsatisfied` and the plugin does not load. R10 forbids that state from ever reaching the default branch: the major bump and the dependents' widened ranges land in one commit | R3, R10 |
| C4 | Two installed plugins declare incompatible ranges on `devdigest-standards` (`~1.1` and `~2.0`) | The second install fails with `range-conflict`. This is why R3 mandates `^1.0` on both dependents rather than a tilde: one shared caret range cannot conflict with itself, and a tilde pins so tightly that any minor bump splits the two | R3 |
| C5 | The user uninstalls `sdd-engineering` while `architecture-review` remains | `devdigest-standards` stays — it is still required. After uninstalling both, `claude plugin prune` removes it, unless the user installed it explicitly, in which case it is never pruned | R3 |
| C6 | A symlink target is renamed in `.claude/` and the link in `plugins/` is not updated | The marketplace gate fails the PR naming the dangling link and its plugin; it never publishes an empty `skills/` directory. Without R12's path filter this PR would be green | R11, R12 |
| C7 | A plugin is renamed after users have installed it | The old name is added to `renames` in the same commit as the rename; already-installed clients resolve through it instead of erroring. Withdrawal is `"<name>": null`. An in-flight session keeps the loaded copy until `/reload-plugins`; the user is not force-migrated mid-session | R4, root `INSIGHTS.md:19-40` |
| C8 | A user installs `research-tools` alone | They get exactly one agent, no skills, no hook, and no dependency. `researcher` has no `Skill` tool, so nothing it needs is missing. Its README says so explicitly rather than leaving the emptiness to be read as breakage | R3, R17 |
| C9 | `architecture-reviewer` needs the two rule sets but can no longer read them by path (R6) | It obtains them by invoking the named skills, which requires granting it the `Skill` tool → **Q2**. Whatever the mechanism, the reviewer must not silently judge against no rule set: absent rule text is a hard error in its report, not a lenient verdict | R6, Q2 |
| C10 | A developer works on `sdd-engineering` and `devdigest-standards` together | `claude --plugin-dir ./plugins/devdigest-standards --plugin-dir ./plugins/sdd-engineering`. The local copy satisfies the dependency entry even though the entry names a marketplace, and no version constraint is checked against a local copy — so local dev can never reproduce C3 or C4. Only R13 can | R13 |
| C11 | The marketplace is served from a static URL rather than added via git | Relative `./plugins/<name>` sources silently fail to resolve. The published instruction is `/plugin marketplace add AIengineerDev/dev-digest` and nothing else | R4 |

---

## Non-functional requirements

| Axis | Bound | Req | `n/a` because |
| --- | --- | --- | --- |
| Latency | Every added gate is Node-standard-library only and must keep `marketplace.yml` under its current no-install shape (`.github/workflows/marketplace.yml:26-33`) — target **under 10 s** for R11 | R11, R12 | |
| Scale | 4 plugins, 22 artefacts, one marketplace. A transitive install of `devdigest-standards` adds 5 skills to the user's session; the largest single `SKILL.md` description is 604 characters (`.claude/skills/dependency-checker/SKILL.md:3`) | R1, R3 | |
| Cost | **Zero** LLM calls added at install, at gate time, or at release. Nothing here touches `costUsd` | R11, R13 | |
| Failure | R11, R13 and R16 fail hard. R16 is the one that must fail **closed**: an unidentifiable agent is denied, never allowed | R11, R13, R16 | |
| Security | The fence is a security boundary that a plugin cannot inherit from `.claude/settings.json` — R15 and R16 exist for that. No secret enters any plugin: secrets live in `~/.devdigest/secrets.json` (root `CLAUDE.md`). A published prompt is world-readable, so nothing internal-only may be inside one | R15, R16, R17 | |
| Accessibility | — | | No UI. Every surface is a CLI command already provided by Claude Code |
| i18n | Every published `description`, `README.md` and `CHANGELOG.md` is English. Four Ukrainian companion files exist (`docs/temp/marketplace-research.md` §6) and are **not** reachable from any plugin under R2 | R2, R17 | |
| Observability | After a bad publish, `claude plugin list --json` `errors`, the per-plugin tag, and the `CHANGELOG.md` entry must together identify what shipped and when. A release with no changelog entry is not diagnosable | R8, R9, R13 | |

---

## Acceptance criteria

| ID | Criterion — checkable from outside | Req | Verify by |
| --- | --- | --- | --- |
| A1 | `find plugins -type f -name '*.md'` returns **nothing** under `agents/` or `skills/`; `find plugins -type l` lists every one, and each resolves inside `.claude/` | R2 | manual command · `marketplace-verify` |
| A2 | `.claude/` is unchanged in structure: `ls .claude/skills` still lists 9 directories and `ls .claude/agents` 8 `.md` files plus `README.md`, and a session in this repo still routes `implementer` and `onion-architecture` | R2 | manual command · `cd evals && pnpm eval:quality` |
| A3 | `node scripts/marketplace-verify.mjs` exits 0 on the published tree; deleting one symlink target makes it exit 1 naming the dangling link and its plugin | R11 | manual command |
| A4 | Editing only `.claude/skills/onion-architecture/SKILL.md` in a PR triggers the `marketplace` workflow | R12 | scratch PR |
| A5 | `node scripts/build-catalog.mjs --report` prints `marketplace devdigest-tools`, a `plugin 4` line, and **zero** artefacts with `plugin: null` among the 7 skills, 8 agents and 1 hook | R14 | manual command |
| A6 | `grep -rn '\.claude/' $(find plugins -type l)` returns no match — no shipped artefact contains a repo-rooted path | R6 | manual command · `marketplace-verify` |
| A7 | From a clean clone, `/plugin marketplace add AIengineerDev/dev-digest` then `/plugin install sdd-engineering@devdigest-tools` also installs `devdigest-standards`, and `claude plugin list --json` shows `errors` empty | R3, R13 | manual verification in Claude Code |
| A8 | Installing `research-tools@devdigest-tools` alone installs exactly one plugin and one agent, with `errors` empty | R3, C8 | manual verification in Claude Code |
| A9 | With `sdd-engineering` enabled, disabling `devdigest-standards` is refused and the message names `sdd-engineering` | C2 | manual verification in Claude Code |
| A10 | In a session with `sdd-engineering` installed **as a plugin**, `spec-creator` asked to write `server/src/x.ts` is **denied** by the hook, and asked to write `specs/99-scratch.md` succeeds | R15, R16 | manual verification in Claude Code |
| A11 | Same session: `spec-creator` asked to run `echo hi > server/src/x.ts` is denied — the `Bash` arm of the matcher survives distribution | R15, R16 | manual verification in Claude Code |
| A12 | `claude plugin tag --push` produces `sdd-engineering--v1.0.0`; `git tag --list` shows no new `marketplace-v*` tag for this release | R9 | manual command |
| A13 | Bumping `plugin.json` `version` without the marketplace entry makes both `claude plugin validate .` / `marketplace-verify` and `claude plugin tag` refuse | R9, R10, R11 | manual command |
| A14 | `plugins/sdd-engineering/README.md` explains the six-stage chain and the C2 disable refusal; every plugin has a `CHANGELOG.md` whose first entry names its version, tag and artefacts | R7, R8 | manual read |
| A15 | `.claude-plugin/marketplace.json` parses, `name` is `devdigest-tools` (absent from the reserved set at `scripts/marketplace-verify.mjs:32-38`), `renames` is `{}`, and every `source` is `./plugins/<name>` | R4, R5 | `marketplace-verify` |
| A16 | Setting `sdd-engineering`'s dependency range to `~0.9` makes an install fail with `dependency-version-unsatisfied`, and `marketplace-verify` catches the same thing before publish | R3, R11, C3 | manual command · manual verification in Claude Code |

---

## Traps

- **The gate that guards the plugins does not watch the plugins' content.**
  `.github/workflows/marketplace.yml:11-21` has no `.claude/**` filter. Under R2
  that is the content. Fix the filter in the same change that creates the links,
  or every artefact edit ships unverified (R12).
- **`scripts/release.sh` is built around one tag for everything** — `TAG=
  "marketplace-v$VERSION"` (`:45`), the previous-tag lookup (`:97`) and the
  annotated tag body listing every plugin (`:120-127`). Per-plugin lines are not
  a parameter change; the script's whole shape assumes the single line.
- **A relative-source plugin has no ref of its own** (root `INSIGHTS.md:28-35`).
  Tags name a good state for rollback; they do not gate what users receive. The
  default branch does.
- **`claude --plugin-dir` skips version checking entirely.** Local development
  will never reproduce a range failure (C10) — only R13 will.
- **The fence may fail open, not closed.** A hook that cannot recognise the agent
  passes silently by design (`.claude/hooks/spec-creator-guard.mjs:33-36`, `pass()`
  exits 0). Under distribution that is the likely failure and the invisible one
  (R16).
- **Two things called "skills" again.** `.claude/skills/**` ship here;
  `skills/**` is product data and must not appear in any plugin. Three
  directories also look like skills and are not: `.claude/skills/pr-self-review/`,
  `.claude/skills/react-component-quality/` (no `SKILL.md`, excluded at
  `scripts/build-catalog.mjs:95-102`) and `skills/api-contract-reviewer/`.
  Linking any of them publishes an unusable artefact.
- **`doc-writer` and `test-writer` belong to no plugin** in R1. They are two of
  the eight agents in `.claude/agents/README.md` and the `/impl` chain names
  `doc-writer` as the stage that flips a spec to `shipped`. Publishing
  `sdd-engineering` without it ships a chain that cannot end → **Q1**.

---

## Pending inputs — provisional until these arrive

The CTO will supply (a) **screenshots naming the exact plugin contents** and
(b) **links to the original repositories** the agents and skills were taken from.

| What they settle | Provisional until then |
| --- | --- |
| The final artefact list per plugin | R1's membership. The four plugin names, the shared-plugin decision and R2's mechanism do **not** depend on it |
| Whether `doc-writer` and `test-writer` join `sdd-engineering` | Q1 |
| Upstream provenance and licence attribution | R17's content; the requirement that provenance be recorded stands either way |

Nothing else in this spec is waiting on them.

---

## Open questions

| ID | Question | My proposed default | Blocks |
| --- | --- | --- | --- |
| Q1 | Do `doc-writer` and `test-writer` ship in `sdd-engineering`? | **Yes, both.** `doc-writer` is the only agent that flips a spec to `shipped` and the chain is incomplete without it; `test-writer` is out of the `/impl` chain by a cost decision (root `INSIGHTS.md`, 2026-08-18) but is still part of the documented set. Ship them, say in the README that `test-writer` is invoked by hand | R1 · R7 |
| Q2 | How does `architecture-reviewer` reach the two rule sets once path references are gone (R6, C9)? | **Grant it the `Skill` tool and change the prompt to invoke `onion-architecture` / `frontend-ui-architecture` by name.** It is the same on-demand cost `implementer` already pays. The cost: `Skill` also opens `engineering-insights`, i.e. a write path into `INSIGHTS.md` from a read-only agent — so the same change must forbid it in the prompt and extend `spec-creator-guard.mjs` to deny `INSIGHTS.md` writes from `architecture-reviewer` | R6 · C9 |
| Q3 | Do the plugins also ship `.claude/settings.json`-style defaults for a consuming team (`extraKnownMarketplaces` / `enabledPlugins`)? | **No.** That block belongs to the consumer's repo and to the catalog site's bundle builder (`specs/16` R20), not inside a plugin | R15 · nothing |
| Q4 | Does `devdigest-standards` start at `1.0.0` or `0.x`? | **`1.0.0`.** `^1.0` (R3) only behaves as intended above 1.0.0; under `0.x` a caret range is effectively a pin and C4 becomes routine | R3 · R9 |
| Q5 | Should `devdigest-standards` set `defaultEnabled: false`, given it is mostly consumed transitively? | **No.** A user may legitimately want the rule sets alone, and enabling a dependent writes an explicit `true` anyway (Claude Code plugin documentation), so the flag buys nothing and surprises anyone who installs it directly | R3 · nothing |

---

## Could not establish

- **Whether a symlink under `plugins/**` pointing into `.claude/` is dereferenced
  at install.** The documentation establishes dereferencing for a symlink
  targeting a file *elsewhere in the same marketplace*, and its example is a
  meta-plugin linking to skills defined by **other plugins**. `.claude/` is inside
  the marketplace repository but is not a plugin directory. This is the single
  assumption the whole structural decision rests on, and A1 plus A7 are written
  to prove or break it in the first phase of the work. If it does not hold,
  shape (b) is the fallback and R2 inverts.
- **The `agent_type` value a plugin-provided subagent presents to a `PreToolUse`
  hook.** R16 states the requirement and A10/A11 test it; the value itself is not
  readable from this working tree, and no plugin install of this agent set exists
  yet.
- **Whether `claude plugin tag --push` and `claude plugin list --json` are
  available in the `claude` version in use here.** `scripts/marketplace-verify.mjs:16-21`
  already treats the `claude` CLI as optional and folds its result in when
  present, which suggests it is not guaranteed on PATH in CI.
- **Provenance of the agents and skills.** Pending input (b). No licence claim is
  made anywhere in this spec.
- **Whether `evals/` needs new cases for a plugin-installed artefact.** Root
  `CLAUDE.md` requires `pnpm eval:workflow` when routing rules change; whether
  installing the same prompts through a plugin changes routing is untested, and
  A2 only checks the in-repo path.
