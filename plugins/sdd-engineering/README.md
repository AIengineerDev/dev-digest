# SDD Engineering

Spec-driven development as a chain of specialised agents. You write down what
should exist and why; the chain turns that into a plan, builds it phase by phase,
proves every stated requirement was met, and documents what shipped.

The point is not automation. The point is that **each stage produces an artefact
the next stage can be checked against**, so a mistake surfaces where it is cheap
instead of at review.

```
  spec-creator  →  implementation-planner  →  /impl  →  workflow-retro
   (the what)         (the how)              (the doing)   (what it cost)
```

## Install

```
/plugin marketplace add AIengineerDev/dev-digest
/plugin install sdd-engineering@devdigest-tools
```

This also installs **`engineering-paved-path`** and **`architecture-review`**,
which the chain depends on. You cannot disable either while this plugin is
enabled — the chain calls into both.

## What you get

| Agent | Does | Never does |
| --- | --- | --- |
| `spec-creator` | Writes the specification for work not yet built: numbered requirements, acceptance criteria a reviewer can check from outside, the states a design does not cover | Writes code, docs, or edits an existing spec |
| `implementation-planner` | Turns an agreed spec into a plan grounded in your repository, with real gate commands per phase | Writes code or a specification |
| `implementer` | Executes the plan phase by phase, applies the governing skill for each, runs the real gates and reports their actual output | Reviews architecture or security |
| `plan-verifier` | One verdict per stated item, each backed by a file location or command output | Proposes improvements; reviews code |
| `doc-writer` | Documents what already merged, with a diagram, registered where readers will find it | Documents unbuilt work |

| Skill | Does |
| --- | --- |
| `impl` | Drives an approved plan through build → verify → review → accept → ship, spawning the right agent per stage and tracking progress in a run file |
| `workflow-retro` | Measures what a finished multi-agent run cost and proposes prompt changes |

## How to use it

### 1 · Write the spec

Invoke `spec-creator` explicitly. It reads your repository first, then writes one
numbered file. It is fenced by a `PreToolUse` hook that ships with this plugin:
it can write specifications and nothing else, and the fence holds even if the
prompt is ignored or overridden.

A revision is a **new numbered file**, never an edit to the old one. That is
deliberate — a spec that can be quietly rewritten is a spec nobody can be held to.

### 2 · Plan it

Invoke `implementation-planner` with the spec. It audits the requirements before
it reads any code, then writes phases whose gates are commands that actually
exist in your repository. It asks whether to plan for one implementer or parallel
tracks.

### 3 · Run it

```
/impl <path to the plan>
```

Five stages, **one at a time**, resumable from the run file it writes:

1. **build** — `implementer` executes the next unbuilt phase and reports the gate output verbatim
2. **verify** — `plan-verifier` checks the code against the *plan*: was every phase actually built
3. **review** — `architecture-reviewer` judges the change against the paved path, then a fix loop
4. **accept** — `plan-verifier` runs again, this time against the *spec*: this is the only stage that can catch a requirement the planner dropped
5. **ship** — `doc-writer` documents the merged change

It is human-gated. It never runs the whole chain unattended, and it stops and asks
rather than guessing.

### 4 · Look back

`/workflow-retro` after a run measures what the session cost and proposes prompt
changes. It is invoked by a person, never by an agent.

## Why two verification passes

Pass 2 exists because **any check against the plan is blind to a requirement the
plan is missing**. Pass 1 (against the plan) catches a silently skipped phase, at
the cheapest possible moment — before anyone pays to review half-built work. Pass
2 (against the spec) is the only thing that catches a requirement that never made
it into the plan at all. This is what the numbered `R1…Rn` ids in a spec are for.

## What this chain does not do

- **It does not write tests.** No agent here does. `plan-verifier` produces the
  list of acceptance criteria with no test behind them, and `/impl` carries that
  list to the end of the run and reports it. That gap is acceptable only while it
  stays visible — if a closing report stops naming it, the saving has turned into
  silent debt.
- **It does not merge or push.** Git state is yours.
- **It does not review security.** Bring your own reviewer for that.

## Model choice

`spec-creator` and `implementation-planner` run on the strongest model available:
they decide *what* gets built, and a wrong requirement is the one error every
later stage inherits. The mechanical stages run cheaper — an agent whose own
prompt forbids an unevidenced verdict is one a smaller model can run, because the
output format does the constraining.

## Configuration

Nothing to configure. The agents read your repository as they find it. Where a
phase needs a rule — which folder a file belongs in, which package manager to
use — the chain invokes the matching skill from `engineering-paved-path` rather
than assuming.
