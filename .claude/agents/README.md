# `.claude/agents/` — the agent set

Eight subagents, each with a different job and a different set of hands. This
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
| [`specreator`](specreator.md) | Writes the spec for unbuilt work: what, why, and the states a design forgot | `opus` | `Read, Grep, Glob, Bash, Write, Agent` | new specs only |
| [`implementation-planner`](implementation-planner.md) | Turns an agreed spec into a Development Plan grounded in the repo | `opus` | `Read, Grep, Glob, Bash` | no |
| [`implementer`](implementer.md) | Executes an approved plan across `client/` and `server/` | `sonnet` | `Read, Grep, Glob, Edit, Write, Bash, Skill, TodoWrite` | yes |
| [`test-writer`](test-writer.md) | Writes tests in the right lane, imitating the model file for that lane | `sonnet` | `Read, Grep, Glob, Edit, Write, Bash, Skill, TodoWrite` | tests only |
| [`architecture-reviewer`](architecture-reviewer.md) | Judges code against the layering boundaries; findings with evidence | `opus` | `Read, Grep, Glob, Bash` | no |
| [`plan-verifier`](plan-verifier.md) | One verdict per stated plan/spec item, each backed by evidence | `opus` | `Read, Grep, Glob, Bash` | no |
| [`doc-writer`](doc-writer.md) | Documents shipped features into the surface that owns them, with diagrams | `sonnet` | `Read, Grep, Glob, Edit, Write, Bash` | docs only |

**Security review is not an agent here — use the built-in `/security-review`
skill.** Its rule set (secrets handling, prompt-injection fencing, rate limits)
is a different job from layering, and Claude Code ships a working reviewer for
the branch diff. Run it beside `architecture-reviewer` in the loop above. Do not
confuse it with `.claude/skills/pr-self-review/`, which is a **local plan
document**, not a skill and not built in — see the boundaries table.

`implementer` has no `Agent` tool, so it cannot summon the reviewers on its own
work, and the reviewers are read-only so they cannot fix what they find. The loop
closes through `implementation-planner`: hand it the review report, get a
remediation plan back, run `implementer` on that. Keeping the implementer
plan-bound is the point — it never decides for itself what is worth fixing.

## Artifacts and the handoff

```
question ──► researcher ──► Research Report (text)

request  ──► specreator ──► specs/NN-<feature>.md   (it writes the file itself)
+ design                      │  path passed as the task
                              ▼
spec  ──► implementation- ──► Development Plan (text)
             planner          │  main session saves it
                              ▼
                          plans/NN-<feature>.plan.md
                              │  path (+ track name, if the plan has Tracks)
                              ▼
plan     ──► implementer ──► code + Implementation Report
             (×N, one per         │
              track, parallel)    ▼
                          plan-verifier  PASS 1 — against the PLAN
                                   │     "was every phase actually built?"
                                   ▼
                          architecture-reviewer  +  /security-review
                                   │     findings
                                   ▼
                          implementation-planner  ──► remediation plan
                                   │                  ──► implementer
                                   ▼
                          test-writer   ◄── brief = pass 1's "not checkable" list
                                   │
                                   ▼
                          plan-verifier  PASS 2 — against the SPEC
                                   │     "was every requirement satisfied?"
                                   ▼
                          doc-writer ──► docs/ + flips the spec to `shipped`
```

Two things about this order are deliberate and were wrong before:

- **`plan-verifier` runs first, not last.** It is the cheapest way to learn that
  a phase was silently skipped, and paying for a review and a test suite on
  half-built work is the expensive alternative. Its pass-1 `Items that were not
  checkable` list is then handed to `test-writer` as a brief — those are exactly
  the acceptance criteria whose `Verify by` lane has no test yet.
- **Pass 2 checks the spec, not the plan.** A requirement the *planner* dropped is
  invisible to any check against the plan, because the plan is already missing
  it. The `R1…Rn` ids in a `specreator` spec are what make that pass cheap.

`test-writer` comes after the review loop because architecture findings move
files, and a test written against the old placement is a test rewritten.

`specreator` is the only agent that both writes its own artifact and is bounded
mechanically — see the hook row in the permissions table. Nothing here is chained
automatically; a human runs each step. `plan-verifier` takes **two** inputs — the
finished code and the document to check it against.

| Agent | Input | Output | Where the output goes |
| --- | --- | --- | --- |
| `researcher` | A question with an answer condition. Without one it asks up to three clarifying questions and stops | Research Report: Question · Answer · Evidence table (`path:line` or URL + source tier + version) · **Not established** · next step | Relayed by the main session; not persisted unless asked |
| `specreator` | A feature request, plus a design — normally a `design-mocks/src/NN-*.jsx` module, or image paths | The spec file, plus a short report: path created · requirement and open-question counts · the most consequential gap · **Could not establish** | It writes the file itself — `specs/NN-<feature>.md` or `<package>/specs/NN-<feature>.md`. Nothing else is writable |
| `implementation-planner` | **A spec path**, or a concrete request if no spec exists, or **a review report** when it is producing a remediation plan | Development Plan: Goal/Done-when · **Requirement audit** · Context read · Prior art & rejected · Scope · Contract changes · Phases **or** Tracks · Verification matrix · Traps · Risks · **Recommendations** · Out of scope | Main session saves it to `plans/NN-<feature>.plan.md`, matching the spec's number |
| `implementer` | **A path to a saved plan**, plus **the track name** when the plan has `## Tracks` (it reads the file itself) | Code changes + Implementation Report: Changes · Skills applied · Deviations · Gates run with real output · Tests added · Self-check · **NOT verified here** · Follow-ups | Report relayed; code stays in the working tree, uncommitted |
| `test-writer` | A change to cover: paths, a diff, or an Implementation Report | Test files + Test Report: Tests added (with "would it pass if the change were reverted?") · Gates run · **Not covered** · Untestable as written | Tests in the working tree, uncommitted; report relayed |
| `architecture-reviewer` | The paths or diff to review | Architecture Review Report: Verdict · `pnpm arch` result as a fact · Findings table · Considered and not a finding · **Not established** | Nowhere — relayed |
| `plan-verifier` | **A plan/spec path** plus what to check it against. Pass 1 gets the **plan**, pass 2 gets the **spec** | Plan Verification Report: Verdicts table (one row per item) · Gates run · Scoped out but present · **Items that were not checkable** · ≤3 bullets of anything else | Nowhere — relayed |
| `doc-writer` | The shipped change plus the plan or spec that drove it | Doc edits + Documentation Report: Documented · Diagrams · Pointers updated · Spec status changed · **Belongs in INSIGHTS.md, not written** · **Could not ground** | Files under `docs/`, `<pkg>/docs/`, a `README.md`, or a spec's status block |

Every agent has a mandatory section for the limits of its own work, and none of
them may be left empty by default: `specreator`'s **Could not establish**,
`implementation-planner`'s **Requirement audit**, `researcher`'s **Not established**,
`implementer`'s **NOT verified here**, `test-writer`'s **Not covered**,
`architecture-reviewer`'s **Not established**, `plan-verifier`'s **Items that were
not checkable**, and `doc-writer`'s **Could not ground**. That is where the
limits get stated instead of being left for the reader to discover.

## Permissions, and why each one is shaped that way

| Decision | Reason |
| --- | --- |
| `implementation-planner` has no `Write`/`Edit` | A plan is a proposal. It returns text; a human decides whether it becomes a file in `plans/` |
| `implementation-planner` has no `Skill` | It must *know* which skills bind the implementer, not run them. The binding table is in its prompt; it reads a `SKILL.md` with `Read` when a phase lands near the edge. No preload, no per-run token cost |
| `specreator` has `Write` but **not** `Edit` | It creates specs; it never amends one. An agreed spec is a record, and a revision is a new numbered file that supersedes it — so the tool that mutates a file in place is simply absent |
| `specreator` is fenced by a **`PreToolUse` hook**, not just prompt text | [`specreator-guard.mjs`](../hooks/specreator-guard.mjs) denies any write outside `specs/<name>.md` or `<package>/specs/<name>.md`, denies overwriting an existing file, and denies `Edit`/`MultiEdit`/`NotebookEdit` outright. It keys on the `agent_type` field in the hook payload, so it is a **no-op for every other agent** and for the main session |
| The hook covers **`Bash` too**, for `specreator` only | A file-tool fence that ignores the shell is not a fence — `echo … > server/src/x.ts` walks past a `Write`-only matcher. Redirection, `tee`/`rm`/`cp`, in-place `sed -i`, state-changing git and any package manager or runtime are denied; `git log`/`show`/`blame`, `ls`, `rg`, `wc` pass silently. The same treatment is **not** applied to the other read-only agents, whose shells are still governed by prompt text alone |
| `specreator` is the one agent with `Agent` | Its prompt restricts it to spawning **`researcher`**, fanned out one question per agent. Researching before writing a requirement is the difference between a spec and a guess, and `researcher` cannot write anything. The restriction is prompt text: the tool grant itself cannot name which agent types are reachable, so a `specreator` that ignored its prompt could spawn a builder that the hook does not fence |
| `implementer` has `Skill` | So it can invoke `onion-architecture` / `frontend-ui-architecture` **before** creating a file, and `engineering-insights` at the end — on demand, never preloaded |
| `implementer` has no `Agent` | It cannot delegate its own review. Architecture and security are someone else's judgement, deliberately |
| No agent has web access except `researcher` | Looking things up mid-implementation is a signal to go back to `researcher` or `implementation-planner`, not to improvise |
| `Bash` everywhere, but read-only for `researcher`, `specreator` and `implementation-planner` | `git log -S`, `git blame` and `git show` answer "when and why did this become this". All three prompts forbid writing through the shell (`>`, `tee`, `sed -i`) and any state-changing git command. The hook does **not** see shell writes, so for `specreator` this prompt rule is the only thing closing that door |
| `test-writer` has `Skill` | `frontend-ui-architecture` decides which folder a `*.test.tsx` lives in, and `engineering-insights` brackets any non-trivial task. It reads `TESTING.md` for *what* to test — the skill disclaims test strategy |
| **`doc-writer` has no `Skill`** | The one place where withholding it is a **safety** decision, not a token one: `engineering-insights` is the only mechanism that writes `INSIGHTS.md`, and `doc-writer` must be structurally unable to reach those files. It reads them and reports what belongs there |
| Both reviewers are read-only, with a `Bash` allow-list | They may run gates — `pnpm arch`, the test suites, `check-shared.sh` bare — because a verdict needs real output. They may not migrate, seed, install, run Docker, or change git state |
| `researcher`, `specreator` and `implementation-planner` may **not** run gates | None of them is judging finished work; a plan built by running the suite is a plan that already implemented something, and a spec is written before there is anything to run |
| No agent has `Agent` **except `specreator`** | A reviewer that can spawn a fixer stops being a reviewer, and a writer that can spawn its own reviewer grades its own homework. `specreator` is the exception because the agent it may spawn is read-only and answers questions it would otherwise guess at — see the row above |
| Write scope is enforced in **prompt text** for `test-writer` and `doc-writer`, and by a **hook** for `specreator` | The two older agents are told their allow-list; the tool grant itself is not path-scoped. `specreator` is the first one bounded mechanically — see below |
| No `skills:` frontmatter on any agent | That field injects a skill's **full text** at startup, on every run, whether or not it is needed |

### Mechanical write-scoping — settled for one agent, open for two

`settings.json` permission **rules** cannot scope a grant per agent, but a
`PreToolUse` **hook** can: its payload carries `agent_type`, so one hook script
can hard-deny a path for exactly one subagent and pass silently for everyone
else. That is how `specreator` is fenced, and it is the pattern to copy.

`test-writer` (tests only) and `doc-writer` (docs only) are **not** fenced this
way yet — their boundary still lives in their prompts. Extending
`specreator-guard.mjs` to cover them is the obvious next step and has not been
done. Until it is, the structural half of `doc-writer`'s guarantee is what
matters: it has no `Skill`, so the *supported* path into `INSIGHTS.md` is closed.

A hook sees tool calls, not shell redirection. Every read-only agent's prompt
forbids `>`, `tee` and `sed -i` for that reason, and no hook enforces it.

## Boundaries between agents

Eight agents whose jobs touch. Each row is settled, not left to be discovered:

| Pair | Where the line is |
| --- | --- |
| `specreator` ↔ `implementation-planner` | `specreator` says **what** is built and why, and owns `specs/`. `implementation-planner` says **how and in what order**, and owns `plans/`. The planner never fills a hole in a spec — a gap is a row in its Requirement audit, a better idea is a line in Recommendations |
| `specreator` ↔ `researcher` | `researcher` answers a question and persists nothing. `specreator` decides what to build and leaves a file — and **spawns `researcher`** when a requirement depends on something it would otherwise guess, fanning out one question per agent. It never spawns anything else. A fact from a researcher still carries its own `path:line` in the spec; "the researcher said so" is not a citation |
| `implementer` ↔ `test-writer` | `implementer` writes the tests **its own plan phase calls for**. `test-writer` is for when tests *are* the task: backfilling an untested area, hardening a suite, a test-only phase |
| `architecture-reviewer` ↔ `plan-verifier` | The first judges code against layering rules **regardless of any plan**; the second judges it against **stated items regardless of quality**. Neither returns the other's verdict |
| `plan-verifier` ↔ `researcher` | `researcher` answers an open question; `plan-verifier` answers a closed checklist and never widens it |
| `doc-writer` ↔ `specreator` | `specreator` writes **intent** into `specs/`; `doc-writer` writes **how it works today** into `docs/` and flips a shipped spec's status. `doc-writer` never authors a spec for unbuilt work, and `specreator` never documents built work |
| `doc-writer` ↔ `engineering-insights` | `doc-writer` never writes any `INSIGHTS.md`. Rejected approaches belong there, not in `docs/` |
| `architecture-reviewer` ↔ `pnpm arch` | The tool proves the 8 cruiser rules. The agent reports that result as a fact and may not restate any of them as a finding — its findings are the ones no tool can produce |
| any agent ↔ the two inert skill folders | `.claude/skills/pr-self-review/` holds a `PLAN.md` and `react-component-quality/` holds only a `README.md`. Neither has a `SKILL.md`, so neither is invokable; no agent may cite either as a gate. `pr-self-review` is **ours** (commit `3d8ec5a`), not a built-in — its own plan concludes that a skill cannot block anything, and that the blocking layers are a `pre-push` hook and GitHub branch protection |
| `architecture-reviewer` ↔ `/security-review` | Layering versus secrets, injection and abuse surface. Different rule sets, run side by side; neither returns the other's verdict |

## What the rules are based on

The agent files carry the rules; this is where they came from. Sources below
cover `implementation-planner` and `implementer` first — they were authored
first — then the four that followed, then `specreator`.

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
| skills — *Restrict Claude's skill access* | Omitting `Skill` blocks skill invocation entirely → how `implementation-planner` is kept from running what it only needs to know about, and how `doc-writer` is kept out of `INSIGHTS.md` |
| [hooks](https://code.claude.com/docs/en/hooks) — *PreToolUse input* | The payload carries `agent_id` and `agent_type` when the call comes from inside a subagent, and `hookSpecificOutput.permissionDecision` accepts `allow`/`deny` with a reason → `specreator` can be path-fenced without touching any other agent (verified 2026-08-17) |
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
| measured 2026-08-17: `.github/workflows/` holds `client`, `mcp`, `reviewer-core`, `server-unit`, `server-integration` | CI exists — the "there is no CI" rule these agents carried was written on a branch that predated it — but every workflow is **path-filtered**, so a change outside a filter is checked by nothing. Local gates stay the evidence. `TESTING.md` also names an `e2e-web` workflow that does not exist |
| measured 2026-08-17: `cd client && pnpm lint` | `eslint src` exits 0 with **0 errors and 42 warnings**. It is a real gate no table used to name, and like `pnpm arch` it has a baseline: green means no new **errors**. Every agent that runs it is told not to fix the 42 and not to run `--fix` |
| measured 2026-08-17: `server/package.json` + `vitest.config.ts` | `"test": "vitest run"` is unfiltered over **42 test files, 15 of them `*.it.test.ts`** with `testTimeout: 120_000` for testcontainers — so a per-phase full suite pays for Postgres on every phase. Hence the split into scoped `--reporter=dot` phase gates and one complete final gate |
| [`TESTING.md`](../../TESTING.md) | The typology `test-writer` filters by, the lane table, and the rule that a DB-backed test importing `test/helpers/pg.ts` **must** be named `*.it.test.ts` |
| `server/test/*.test.ts`, `client/**/*.test.tsx`, `e2e/specs/*.flow.json` | The model file per lane that `test-writer` imitates — real files, not an invented style |
| `server/.dependency-cruiser-known-violations.json` | The 11 baseline entries `architecture-reviewer` must not report as new (counted 2026-08-09: `no-circular` ×5, `routes-no-db` ×4, `helpers-are-pure` ×1, `no-cross-module-internals` ×1) |
| [`specs/README.md`](../../specs/README.md) | Where requirements live, the shapes they take, and what happens to a spec once shipped — `specreator` extends that shape rather than inventing one, `plan-verifier` reads them, `doc-writer` closes them |
| [`specs/04-intent-layer.md`](../../specs/04-intent-layer.md), [`07-smart-diff.md`](../../specs/07-smart-diff.md) | The real specs in this repo, which extend the README's shape with *How it works*, *Thresholds*, *Decisions — do not re-open these* and *Traps* → the sections `specreator` may add, and evidence that the house style is longer than the minimum |
| [`plans/README.md`](../../plans/README.md) | That plans live beside specs under a matching number, and that `plan-verifier` needs the file to exist |
| [`design-mocks/INDEX.md`](../../design-mocks/INDEX.md) + root `INSIGHTS.md` (2026-08-06) | The 28 extracted screen/component modules are the design source `specreator` reads, and `DevDigest Design (standalone).html` at the repo root is a 1.8 MB base64 bundle that must never be opened — both are in its exclusion list |
| measured 2026-08-17: `wc -l specs/*.md` | The 119–477 line range that calibrates spec length, and the observation that the longest are the ones spanning three packages |
| [`docs/README.md`](../../docs/README.md) + each `<package>/docs/README.md` | The routing table `doc-writer` follows, including each surface's explicit "not here" |

### The project's skills

`implementation-planner` names the governing skill per phase; `implementer`
invokes it before writing the file it governs.

| Skill | Binds |
| --- | --- |
| [`onion-architecture`](../skills/onion-architecture/) | Anything under `server/src`: routes, services, repositories, adapters, container wiring |
| [`frontend-ui-architecture`](../skills/frontend-ui-architecture/) | Any new file under `client/src`: placement, folder shape, where logic lives |
| [`engineering-insights`](../skills/engineering-insights/) | Recall at the start of a non-trivial task, record at the end |

**Three skills, and two folders that are not skills.**
`.claude/skills/pr-self-review/` holds a `PLAN.md` and
`.claude/skills/react-component-quality/` holds only a `README.md`. Neither has a
`SKILL.md`, so Claude Code does not see either as a skill, nothing invokes them,
and no agent may cite either as a gate. Both are unfinished work, not
conventions — decide to build or delete them rather than leaving them to be
mistaken for a fourth and fifth skill.

## Using them

```
"research <question>"                        → researcher
"spec <f>, design design-mocks/src/12-*.jsx" → specreator → writes specs/NN-<feature>.md
"plan specs/NN-<feature>.md"                 → implementation-planner
                                               → save to plans/NN-<feature>.plan.md
"implement plans/NN-<f>.plan.md, track B"    → implementer   (one per track)
"verify plans/NN-<f>.plan.md vs main"        → plan-verifier  PASS 1
"architecture review of <paths>"             → architecture-reviewer
/security-review                             → built-in skill, same stage
"remediation plan from <report>"             → implementation-planner
"write tests for <the not-checkable list>"   → test-writer
"verify specs/NN-<feature>.md vs main"       → plan-verifier  PASS 2
"document <feature>"                         → doc-writer  (flips Status: shipped)
```

The `/impl` skill (`.claude/skills/impl/`) drives the **second half** of this
chain — `build · verify · review · accept · ship` — keeps the run state in
`plans/NN-<feature>.run.md`, and bounds the review fix loop at two rounds. It is
`disable-model-invocation: true`: a human types it, and nothing auto-fires a run
that spawns implementers. `specreator` and `implementation-planner` are run
manually, one at a time, and are deliberately outside it — the two stages that
decide *what* gets built are the two a human should not skim.

**`test-writer` is not in the chain**, by a cost decision made 2026-08-18. The
coverage that exists is whatever a plan's phases told the implementer to write,
and `plan-verifier`'s `Items that were not checkable` list is carried to the end
of the run and reported rather than acted on. Put it back when the tests it would
write are worth more than the tokens.

**Do not stop before `doc-writer`.** It is the only agent that moves a spec's
`Status:` to `shipped` — `plan-verifier` is explicitly forbidden from touching
that line. A workflow that ends at verification leaves every spec on `draft`
forever, and `specs/README.md` is blunt about the cost: the next agent reads a
finished feature's spec as current intent.

Designs go to `specreator` as **paths**, never as an image pasted into the main
session: a subagent starts with a fresh context and cannot see the conversation's
attachments. The house design source is [`design-mocks/`](../../design-mocks/) —
28 screen and component modules indexed in its `INDEX.md`, quotable with
`path:line` in a way a PNG never is. Pass the module path. Only fall back to
image paths for a screen the mocks do not cover.

A vague brief gets questions, not output: `researcher` and
`implementation-planner` both stop and ask (up to three questions) when the task
has no answerable done-condition. `specreator` stops in exactly two cases — an
existing spec already covers the request, or it cannot tell what the feature is
*for*. Everything else becomes a row in **Open questions** with a proposed
default, so the work is never blocked on a round trip it can survive without.

## Adding an agent

Match the shape already here: a `description` that says **when** to invoke with
trigger phrases and a negative boundary, an explicit `tools` list, an explicit
`model`, a stated output format, and a mandatory section for what the agent could
*not* establish. Then add a row to the tables above — an agent missing from this
map is an agent nobody remembers to use.
