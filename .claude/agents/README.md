# `.claude/agents/` — the agent set

Seven subagents, each with a different job and a different set of hands. This
file is the map: what each one is for, what it may touch, and what it hands over.
The rules themselves live in the agent files — read those, not a copy of them
here.

Every subagent starts with a **fresh, isolated context**: it sees its own system
prompt and the task it was given, not this conversation, not the files already
read, not another agent's output. That single fact is why the artifacts below are
files and reports rather than "it already knows".

## The set

| Agent | Job | Model | Tools | Writes files? |
| --- | --- | --- | --- | --- |
| [`researcher`](researcher.md) | Answers a question with evidence — from this repo, or from outside it | `sonnet` | `Read, Grep, Glob, Bash, WebFetch, WebSearch` | no |
| [`planner`](planner.md) | Turns a request into a Development Plan grounded in the repo | `opus` | `Read, Grep, Glob, Bash` | no |
| [`implementer`](implementer.md) | Executes an approved plan across `client/` and `server/` | `sonnet` | `Read, Grep, Glob, Edit, Write, Bash, Skill, TodoWrite` | yes |
| [`test-writer`](test-writer.md) | Writes tests in the right lane, imitating the model file for that lane | `sonnet` | `Read, Grep, Glob, Edit, Write, Bash, Skill, TodoWrite` | tests only |
| [`architecture-reviewer`](architecture-reviewer.md) | Judges code against the layering boundaries; findings with evidence | `opus` | `Read, Grep, Glob, Bash` | no |
| [`plan-verifier`](plan-verifier.md) | One verdict per stated plan/spec item, each backed by evidence | `opus` | `Read, Grep, Glob, Bash` | no |
| [`doc-writer`](doc-writer.md) | Documents shipped features into the surface that owns them, with diagrams | `sonnet` | `Read, Grep, Glob, Edit, Write, Bash` | docs only |

**Security review is not here.** Its rule set — secrets handling, prompt-injection
fencing, rate limits — is a separate research job and a separate agent.

`implementer` has no `Agent` tool, so it cannot summon the reviewers on its own
work. A human runs `architecture-reviewer` and `plan-verifier` on its output;
that separation is the point of having them.

## Artifacts and the handoff

```
question ──► researcher ──► Research Report (text)

request  ──► planner    ──► Development Plan (text)
                              │  main session saves it
                              ▼
                          specs/NN-<feature>.md ──────────────┐
                              │  path passed as the task      │
                              ▼                               │
plan     ──► implementer ──► code + Implementation Report      │
                              │                               │
              ┌───────────────┼───────────────┬───────────────┤
              ▼               ▼               ▼               ▼
        test-writer   architecture-    plan-verifier    doc-writer
        (tests +      reviewer         (verdict per     (docs/ +
         report)      (findings)        plan item)       spec status)
```

The reviewers and `doc-writer` are run by a human on the implementer's output,
not chained automatically. `plan-verifier` takes **two** inputs — the finished
code and the same `specs/NN-*.md` the implementer worked from.

| Agent | Input | Output | Where the output goes |
| --- | --- | --- | --- |
| `researcher` | A question with an answer condition. Without one it asks up to three clarifying questions and stops | Research Report: Question · Answer · Evidence table (`path:line` or URL + source tier + version) · **Not established** · next step | Relayed by the main session; not persisted unless asked |
| `planner` | A feature request, plus any existing spec | Development Plan: Goal/Done-when · Context read · Prior art & rejected · Scope · Contract changes · Phases · Verification matrix · Traps · Risks · Out of scope | Main session saves it to `specs/NN-<feature>.md` — the repo's home for intent |
| `implementer` | **A path to a saved plan** (it reads the file itself) | Code changes + Implementation Report: Changes · Skills applied · Deviations · Gates run with real output · Tests added · Self-check · **NOT verified here** · Follow-ups | Report relayed; code stays in the working tree, uncommitted |
| `test-writer` | A change to cover: paths, a diff, or an Implementation Report | Test files + Test Report: Tests added (with "would it pass if the change were reverted?") · Gates run · **Not covered** · Untestable as written | Tests in the working tree, uncommitted; report relayed |
| `architecture-reviewer` | The paths or diff to review | Architecture Review Report: Verdict · `pnpm arch` result as a fact · Findings table · Considered and not a finding · **Not established** | Nowhere — relayed |
| `plan-verifier` | **A plan/spec path** plus what to check it against | Plan Verification Report: Verdicts table (one row per item) · Gates run · Scoped out but present · **Items that were not checkable** · ≤3 bullets of anything else | Nowhere — relayed |
| `doc-writer` | The shipped change plus the plan or spec that drove it | Doc edits + Documentation Report: Documented · Diagrams · Pointers updated · Spec status changed · **Belongs in INSIGHTS.md, not written** · **Could not ground** | Files under `docs/`, `<pkg>/docs/`, a `README.md`, or a spec's status block |

Every agent has a mandatory section for the limits of its own work, and none of
them may be left empty by default: `researcher`'s **Not established**,
`implementer`'s **NOT verified here**, `test-writer`'s **Not covered**,
`architecture-reviewer`'s **Not established**, `plan-verifier`'s **Items that were
not checkable**, and `doc-writer`'s **Could not ground**. That is where the
limits get stated instead of being left for the reader to discover.

## Permissions, and why each one is shaped that way

| Decision | Reason |
| --- | --- |
| `planner` has no `Write`/`Edit` | A plan is a proposal. It returns text; a human decides whether it becomes a file in `specs/` |
| `planner` has no `Skill` | It must *know* which skills bind the implementer, not run them. The binding table is in its prompt; it reads a `SKILL.md` with `Read` when a phase lands near the edge. No preload, no per-run token cost |
| `implementer` has `Skill` | So it can invoke `onion-architecture` / `frontend-ui-architecture` **before** creating a file, and `engineering-insights` at the end — on demand, never preloaded |
| `implementer` has no `Agent` | It cannot delegate its own review. Architecture and security are someone else's judgement, deliberately |
| No agent has web access except `researcher` | Looking things up mid-implementation is a signal to go back to `researcher` or `planner`, not to improvise |
| `Bash` everywhere, but read-only for `researcher` and `planner` | `git log -S`, `git blame` and `git show` answer "when and why did this become this". Both prompts forbid writing through the shell (`>`, `tee`, `sed -i`) and any state-changing git command |
| `test-writer` has `Skill` | `frontend-ui-architecture` decides which folder a `*.test.tsx` lives in, and `engineering-insights` brackets any non-trivial task. It reads `TESTING.md` for *what* to test — the skill disclaims test strategy |
| **`doc-writer` has no `Skill`** | The one place where withholding it is a **safety** decision, not a token one: `engineering-insights` is the only mechanism that writes `INSIGHTS.md`, and `doc-writer` must be structurally unable to reach those files. It reads them and reports what belongs there |
| Both reviewers are read-only, with a `Bash` allow-list | They may run gates — `pnpm arch`, the test suites, `check-shared.sh` bare — because a verdict needs real output. They may not migrate, seed, install, run Docker, or change git state |
| `researcher` and `planner` may **not** run gates | Neither is judging finished work; a plan built by running the suite is a plan that already implemented something |
| None of the four new agents has `Agent` | A reviewer that can spawn a fixer stops being a reviewer, and a writer that can spawn its own reviewer grades its own homework |
| Write scope is enforced in **prompt text**, not mechanically | `test-writer` (tests only) and `doc-writer` (docs only) are told their allow-list; the tool grant itself is not path-scoped. Whether `settings.json` permission rules could scope it is an open question — see below |
| No `skills:` frontmatter on any agent | That field injects a skill's **full text** at startup, on every run, whether or not it is needed |

### Open: mechanical write-scoping

`test-writer` must write only tests and `doc-writer` only documentation, and
today that boundary lives in their prompts. A path-scoped `Write` permission via
`settings.json` may be possible; it has not been verified. Until it is, the
structural half of the guarantee is what matters: `doc-writer` has no `Skill`, so
the *supported* path into `INSIGHTS.md` is closed to it.

## Boundaries between agents

Seven agents whose jobs touch. Each row is settled, not left to be discovered:

| Pair | Where the line is |
| --- | --- |
| `implementer` ↔ `test-writer` | `implementer` writes the tests **its own plan phase calls for**. `test-writer` is for when tests *are* the task: backfilling an untested area, hardening a suite, a test-only phase |
| `architecture-reviewer` ↔ `plan-verifier` | The first judges code against layering rules **regardless of any plan**; the second judges it against **stated items regardless of quality**. Neither returns the other's verdict |
| `plan-verifier` ↔ `researcher` | `researcher` answers an open question; `plan-verifier` answers a closed checklist and never widens it |
| `doc-writer` ↔ `planner` | `planner` writes **intent** into `specs/`; `doc-writer` writes **how it works today** into `docs/` and flips a shipped spec's status. `doc-writer` never authors a spec for unbuilt work |
| `doc-writer` ↔ `engineering-insights` | `doc-writer` never writes any `INSIGHTS.md`. Rejected approaches belong there, not in `docs/` |
| `architecture-reviewer` ↔ `pnpm arch` | The tool proves the 8 cruiser rules. The agent reports that result as a fact and may not restate any of them as a finding — its findings are the ones no tool can produce |
| any agent ↔ `.claude/skills/pr-self-review/` | That folder holds a `PLAN.md`, not a `SKILL.md`. Nothing invokes it; no agent may cite it as a gate |

## What the rules are based on

The agent files carry the rules; this is where they came from. Sources below
cover `planner` and `implementer` first — they were authored first — then the
four that followed.

### Claude Code documentation

Read during authoring via the `researcher` agent; all claims traced to
`code.claude.com`.

| Doc | Rule taken from it |
| --- | --- |
| [sub-agents](https://code.claude.com/docs/en/sub-agents) — *Supported frontmatter fields* | Omitting `tools` inherits **everything**; only `name`/`description` are required → every agent here declares its tools explicitly |
| sub-agents — *What loads at startup* | A subagent sees no conversation history and returns only its final report → the plan is handed over as a **file path**, and `implementer` is told to read it first |
| sub-agents — *Available tools* | `Agent` is withheld unless granted → `implementer` cannot spawn the reviewers |
| sub-agents — *Understand automatic delegation* | Delegation keys off `description`; "use proactively" strengthens it → descriptions state **when** to invoke, with trigger phrases and a negative boundary |
| sub-agents — *Preload skills into subagents*; [skills](https://code.claude.com/docs/en/skills) — *Skill content lifecycle* | Preloaded skill text is a recurring per-run token cost → no `skills:` field; on-demand invocation instead |
| skills — *Restrict Claude's skill access* | Omitting `Skill` blocks skill invocation entirely → how `planner` is kept from running what it only needs to know about, and how `doc-writer` is kept out of `INSIGHTS.md` |
| [best-practices](https://code.claude.com/docs/en/best-practices) — *Add an adversarial review step* | The documented pattern for checking a diff against a plan in a fresh context, and its caution that "a reviewer prompted to find gaps will usually report some" → `plan-verifier`'s evidence rule and both reviewers' *considered and not a finding* sections |
| best-practices — *Give Claude a way to verify its work* | "Have Claude show evidence rather than asserting success" → real command output is required in `test-writer`'s and `plan-verifier`'s reports |
| [code-review](https://code.claude.com/docs/en/code-review) + tools reference | `ReportFindings` is the house shape for review findings (file · summary · failure scenario · category) → `architecture-reviewer`'s findings table mirrors it. Whether a custom subagent may call that tool is **not established**, so it is a convention here, not a dependency |
| sub-agents — *Code reviewer* example | The official read-only reviewer template is `tools: Read, Grep, Glob, Bash` → both reviewers use exactly that |
| skills — bundled `/verify` and `/code-review` | Both exist and are user-invocable only; `/code-review` reads `CLAUDE.md` but **not** a plan file → a custom `plan-verifier` duplicates nothing |

Not from the docs, and stated as such: the planner→implementer split itself, the
model choice per agent, the report formats, and the test-quality bar ("revert the
change — would this test still pass?"), which comes from this repo's `TESTING.md`
rather than from any Anthropic guidance.

### This repository's own curated files

| Source | Rule taken from it |
| --- | --- |
| [`AGENTS.md`](../../AGENTS.md) | The read order `specs/` → `docs/` → `INSIGHTS.md` → source; the pnpm/npm split; the "do not touch" list; `AGENTS.md` is real and `CLAUDE.md` is a symlink |
| [`TESTING.md`](../../TESTING.md) + `server/AGENTS.md` | `*.it.test.ts` is the DB-backed lane; every other server test must be hermetic |
| root + per-package `INSIGHTS.md` | What must not be retried; the vendored-`NAV` limitation; that the server has historically had no transactions; that a schema change adding *and* dropping columns needs two `db:generate` passes |
| [`server/.dependency-cruiser.cjs`](../../server/.dependency-cruiser.cjs) | The 8 machine-enforced layering rules, and that the known-violations baseline is **never** regenerated to silence a failure |
| each package's `package.json` | The gate commands both agents name — verified to exist, rather than quoted from docs |
| measured this session: `.github/` does not exist | There is no CI, so the local gates are the only gates. `TESTING.md` names five workflow files that are absent — `test-writer` is told never to cite them |
| [`TESTING.md`](../../TESTING.md) | The typology `test-writer` filters by, the lane table, and the rule that a DB-backed test importing `test/helpers/pg.ts` **must** be named `*.it.test.ts` |
| `server/test/*.test.ts`, `client/**/*.test.tsx`, `e2e/specs/*.flow.json` | The model file per lane that `test-writer` imitates — real files, not an invented style |
| `server/.dependency-cruiser-known-violations.json` | The 11 baseline entries `architecture-reviewer` must not report as new (counted 2026-08-09: `no-circular` ×5, `routes-no-db` ×4, `helpers-are-pure` ×1, `no-cross-module-internals` ×1) |
| [`specs/README.md`](../../specs/README.md) | Where requirements live, the shapes they take, and what happens to a spec once shipped — `plan-verifier` reads them, `doc-writer` closes them |
| [`docs/README.md`](../../docs/README.md) + each `<package>/docs/README.md` | The routing table `doc-writer` follows, including each surface's explicit "not here" |

### The project's skills

`planner` names the governing skill per phase; `implementer` invokes it before
writing the file it governs.

| Skill | Binds |
| --- | --- |
| [`onion-architecture`](../skills/onion-architecture/) | Anything under `server/src`: routes, services, repositories, adapters, container wiring |
| [`frontend-ui-architecture`](../skills/frontend-ui-architecture/) | Any new file under `client/src`: placement, folder shape, where logic lives |
| [`engineering-insights`](../skills/engineering-insights/) | Recall at the start of a non-trivial task, record at the end |

`.claude/skills/pr-self-review/` holds a `PLAN.md`, **not** a `SKILL.md`. It is
not a skill, nothing invokes it, and neither agent may cite it as a gate.

## Using them

```
"research <question>"                       → researcher
"plan <feature>"                            → planner  → save to specs/NN-<feature>.md
"implement specs/NN-<feature>.md"           → implementer
"write tests for <module>"                  → test-writer
"architecture review of <paths>"            → architecture-reviewer
"verify specs/NN-<feature>.md against main" → plan-verifier
"document <feature>"                        → doc-writer
```

A vague brief gets questions, not output: `researcher` and `planner` both stop
and ask (up to three questions) when the task has no answerable done-condition.
That is intended — an invented answer to an unstated question costs more than the
round trip.

## Adding an agent

Match the shape already here: a `description` that says **when** to invoke with
trigger phrases and a negative boundary, an explicit `tools` list, an explicit
`model`, a stated output format, and a mandatory section for what the agent could
*not* establish. Then add a row to the tables above — an agent missing from this
map is an agent nobody remembers to use.
