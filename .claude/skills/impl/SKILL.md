---
name: impl
description: Execute an approved Development Plan through this repo's build → verify → review → fix → accept → ship chain, spawning the right agent per stage and tracking progress in a run file so a fresh chat can resume. Use when a plan exists in plans/ and the work is to build it. Starts from a plan — writing the spec and the plan are separate, manual steps run before this. Human-gated; it never runs the whole chain unattended.
version: 2.0.0
disable-model-invocation: true
---

# Execute a plan — the run procedure

You are the driver. This skill is a procedure **you** execute in the main
session, spawning subagents with the `Agent` tool. It is not automation and it
cannot enforce anything: a skill is instructions, not a gate.

Two facts shape every rule below:

- **Each subagent starts with a fresh, empty context.** It sees its own prompt
  and the task string you write — not this conversation, not the files you read,
  not the previous agent's report. Everything a stage needs is a **path** you
  pass, or it does not reach the agent.
- **Stages are meant to run in separate chats.** One context carrying plan, code
  and three reviews is a context already degraded by the review stage. The run
  file below is what lets a fresh chat pick up.

The agents carry their own rules. Do not restate them here or in task strings —
`.claude/agents/README.md` is the map.

## This skill starts from a plan

Writing the spec (`specreator`) and the plan (`implementation-planner`) are
**separate, manual steps**, run by a human before this skill is invoked. Do not
spawn either of them to start a run. If there is no plan, say so and stop — the
answer is to go run the planner, not to improvise one here.

The one exception is the fix loop in stage 3, where `implementation-planner`
turns a review report into a remediation plan. That is the same agent doing a
different job, and it stays inside this skill.

## Invocation

| Typed | Does |
| --- | --- |
| `/impl <plan path>` | Starts a run: creates the run file, then runs **build** |
| `/impl` | Reads the run file, reports where the run is, runs the **next** stage |
| `/impl <stage>` | Runs exactly that stage: `build` · `verify` · `review` · `accept` · `ship` |
| `/impl status` | Reports the run file and stops. Changes nothing |

If more than one run is open, ask which one before doing anything.

## The run file

`plans/NN-<feature>.run.md`, numbered to match the plan. You create it, update it
after **every** stage, and read it first on a bare `/impl`. It is the only thing
that survives between chats.

```markdown
# <Feature> — run

**Started:** YYYY-MM-DD
**Plan:** plans/NN-<feature>.plan.md
**Spec:** specs/NN-<feature>.md | none
**Mode:** single implementer | tracks A,B,C

| Stage | State | Artifact / note |
| --- | --- | --- |
| build | done · blocked · pending | tracks landed, or which one is left |
| verify | … | N of M items met |
| review | round 1 of ≤2 | N findings, M blockers |
| accept | … | requirements met, by id |
| ship | … | docs written, Status flipped |

## Unverified acceptance criteria
<From verify: criteria whose `Verify by` lane has no test. Nobody is writing
those tests in this chain — see stage 2. Carry the list to the end and report it.>

## Open findings
<Carried between fix rounds. Empty when the loop closed.>

## Human decisions
<Every answer you were given at a gate, dated. A fresh chat must not re-ask.>
```

## The stages

Five stages. The fix loop is not a stage — it lives inside `review`, because one
round is review→plan→build→review and splitting it across tokens loses the count.

Run one. Update the run file. Stop. Do not chain into the next stage on your own.

### 1 · build

Spawn **`implementer`** with the plan path.

**Single mode:** one agent, the plan path.

**Tracks mode:** first confirm the plan's pre-fan-out work has landed — contracts
in `@devdigest/shared` always come first, and two agents editing a contract in
parallel is the one failure this repo does not absorb, because
`check-shared.sh --fix` mirrors with `--delete` and the loser's edit disappears.
Then spawn **one implementer per track, all in a single message** so they run
concurrently. Each task string names **its track** — an implementer not told
which track it owns will try to build the whole plan.

Collect every Implementation Report. A blocked phase is not a stage failure;
record it and carry it forward.

### 2 · verify — verifier pass 1, against the PLAN

Spawn **`plan-verifier`** with the **plan** path, and override the model to
**`sonnet`**. Pass 1 is mechanical — extract the stated items, find a `path:line`
or a command output for each — and the agent's own rule that a verdict without
evidence is downgraded to `not checkable here` is what keeps a cheaper model
honest. Pass 2 in stage 4 is the one that needs judgement; leave that on `opus`.

This runs *before* the reviewers on purpose: it is the cheapest way to find that
a phase was silently skipped, and reviewing half-built work is the expensive
alternative.

- `not met` → back to stage 1 through the fix loop's remediation plan.
- **`Items that were not checkable`** → copy into the run file under
  **Unverified acceptance criteria**. `test-writer` is deliberately not in this
  chain, so **nobody will write those tests**. The coverage that exists is
  whatever the plan's own phases told the implementer to write. This is a
  known, accepted gap — but it is only accepted if it is *visible*, so it goes
  in the run file and it goes in the final report. Never quietly drop it.

### 3 · review, and the fix loop

Spawn **`architecture-reviewer`** (paths or diff) and run the built-in
**`/security-review`** on the branch. Different rule sets, same stage.

Then loop, **at most twice**:

```
review → findings → implementation-planner (remediation plan)
       → implementer → review again
```

Rules that keep the loop honest:

1. **Only real findings become work.** `Considered and not a finding`, a baseline
   violation touched but not extended, and a settled decision are not fixes. The
   planner is told this; hold it to it.
2. **The remediation plan is a plan file**, saved like any other. The implementer
   never works from a review report directly — keeping it plan-bound is what
   stops it deciding for itself what is worth fixing.
3. **Increment the round in the run file before you start it**, not after. A
   crashed chat must not lose count.
4. **After round 2, stop and report** even if findings remain. A third round
   usually means a disputed finding, or a fix that keeps moving the problem —
   a human decision, not another loop. List what is open under **Open findings**
   and say plainly that the loop did not close.
5. A fix that makes a *new* finding appear is still the same round. Rounds count
   reviews, not findings.

### 4 · accept — verifier pass 2, against the SPEC

Spawn **`plan-verifier`** again with the **spec** path, on its default `opus`.
Walk the `R1…Rn` ids.

This is the only check that catches a requirement the *planner* dropped — any
check against the plan is blind to it, because the plan is already missing it.
Deciding whether a criterion genuinely covers a requirement is judgement, which
is why this pass keeps the stronger model while pass 1 does not.

A `not met` here is more serious than one in stage 2: the chain lost a
requirement between documents. Report it as such and stop for a human — the fix
is a new plan, not a remediation phase.

*Skip only when the run has no spec.* Say so if you skip it.

### 5 · ship

Spawn **`doc-writer`** with the shipped change and the spec.

It is the only agent that may flip the spec's `Status:` to `shipped` —
`plan-verifier` is explicitly forbidden from touching that line. **Do not end a
run before this stage.** A spec left on `draft` is read by the next agent as
current intent, and the next `specreator` will hit its stop rule on a feature
that is already built.

Then two records, and they do not overlap:

- **`engineering-insights`** — what the run taught about the **product code**.
  Only what clears its bar; silence is a valid outcome.
**Do not run `/retro` yourself.** It is human-invoked only
(`disable-model-invocation: true`) and running a retrospective is a decision
about spending tokens that belongs to whoever is paying for them. What you may
do is **offer it in one sentence** at the end of the run — it is the only thing
that can tell you the fan-out was theoretical or that a model override never
applied — and then stop. If the human types `/retro`, that skill takes over.

## The closing report

When the run ends, state plainly, in this order: what shipped · the fix loop's
final round and whether it closed · **the unverified acceptance criteria list** ·
any `not met` still standing. The third one is the item most likely to be
forgotten and the one that matters most, because no test-writer ran.

## Stop and ask, always

- A stage's agent asks a question — relay it, never answer on its behalf.
- The fix loop hit round 2 with findings open.
- Stage 4 reports `not met`.
- There is no plan, or two runs are open and the request does not say which.

## What this skill does not do

- **It does not write the spec or the plan.** Both are manual steps before it.
- **It does not write tests.** `test-writer` is out of this chain by choice;
  the implementer writes only what its plan phases call for.
- **It does not commit, push, or open a PR.** Nothing here changes git state.
- **It does not gate a merge.** Only CI plus branch protection can, and the five
  workflows under `.github/workflows/` are path-filtered — a change outside a
  filter is checked by nothing but the local gates.
