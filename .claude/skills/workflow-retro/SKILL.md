---
name: workflow-retro
description: Retrospective on a finished multi-agent run — measures what the session cost, harvests what the agents said they could not do, and proposes concrete edits to the agent prompts and skills. Human-invoked only: type /workflow-retro (or /workflow-retro deep). Never run it on your own initiative, never as the tail of another workflow, and never because a run just finished. Evaluates the agent system, not the product code.
version: 2.0.0
disable-model-invocation: true
---

# Retrospective on an agent run

**This skill is run by a human, on purpose.** `disable-model-invocation: true`
is set, so nothing can auto-fire it: not a finished `/impl` stage, not a
completed agent, not "the run looks done". If a retro would be useful and nobody
asked for one, say so in a sentence and stop. That restraint is the point — a
retro that runs itself becomes a report nobody reads and a token cost nobody
chose.

## Two modes

| Typed | Scope | Use when |
| --- | --- | --- |
| `/workflow-retro` | **In-context.** This session only: the agent reports still in the conversation, the run file, and `measure.mjs` with no flags (this session's transcript). | The default. The run just happened and you were here for it |
| `/workflow-retro deep` | Adds `measure.mjs --all` across every session, the existing ledger entries, and `git log` over the run's window. | Looking for a trend, or reconstructing a run you were not present for |

`deep` costs meaningfully more and mostly answers a different question — *is
this getting better or worse* rather than *how did this run go*. Do not reach
for it by default.

Two halves, and keeping them apart is the whole discipline:

1. **Measured** — produced by a script, never by you. Tokens, agent count,
   spawn order, concurrency, tool histogram.
2. **Judged** — produced by you, from the agents' own reports and the run file.
   Every claim here names its evidence.

A retro that estimates a number the script could have measured, or asserts a
difficulty with nothing behind it, is worse than no retro: it puts invented
figures on the one surface people will quote later.

## Boundary — this is not `engineering-insights`

| | Records | Goes to |
| --- | --- | --- |
| `engineering-insights` | lessons about the **product code** — what was tried, what failed, which constraint forced a shape | the touched module's `INSIGHTS.md` |
| `retro` (this skill) | lessons about the **agent system** — which agent struggled, what was duplicated, which prompt is wrong | `docs/retro/ledger.md` |

If a finding would help someone changing `server/`, it belongs to
`engineering-insights` and you should say so rather than writing it here. If it
would help someone changing `.claude/agents/*.md` or `.claude/skills/*`, it
is yours.

## Step 1 — measure

```
node .claude/skills/workflow-retro/measure.mjs              # this session
node .claude/skills/workflow-retro/measure.mjs --session <id>
node .claude/skills/workflow-retro/measure.mjs --all        # every session, for trends
node .claude/skills/workflow-retro/measure.mjs --json
```

Paste its `## Measured` output into the retro **verbatim**. Do not round, retype
or "clean up" its numbers — a retyped number is an unsourced number.

Read its `Not measurable from the transcript` section and honour it. In
particular: a subagent's own turns are not recorded anywhere, so **you cannot
know what a subagent read**. Any claim about what an agent looked at must come
from that agent's report, not from the transcript.

## Step 2 — read the run's own record

- `plans/NN-<feature>.run.md` — stages, fix-loop rounds, open findings, and the
  human decisions. This is what the run *meant to do*.
- The reports each agent returned, if they are still in the session.
- `git diff --stat` for what actually changed.

## Step 3 — harvest what the agents already told you

Every agent in this repo has a **mandatory section for its own limits**, and
they are not decoration — they are the retro's primary source. Collect them:

| Agent | Section | Reads as |
| --- | --- | --- |
| `spec-creator` | Could not establish | what the spec is guessing at |
| `implementation-planner` | Requirement audit · Recommendations | where the spec was unbuildable as written |
| `implementer` | Deviations · NOT verified here · Follow-ups | where the plan was wrong or incomplete |
| `architecture-reviewer` | Not established · Considered and not a finding | what no one could judge |
| `plan-verifier` | Items that were not checkable | what the chain cannot prove it did |
| `test-writer` | Not covered · Untestable as written | where the code has no seam |
| `researcher` | Not established | the question that stayed open |

**A section that is empty across every agent in a run is a signal, not a
success.** It usually means the prompt's requirement to fill it is being
skipped — check one report before concluding the run was clean.

## Step 4 — what to judge, and the evidence each needs

Do not answer a row you have no evidence for. Write `no evidence` and move on.

| Question | Evidence that settles it |
| --- | --- |
| **What was hard for an agent?** | tool-use count and duration from the script, relative to other agents of the same type in the same run; an agent that stopped to ask; a `not checkable`/`not established` list that is long |
| **What was easy?** | low tool count with a complete report — worth naming, because it identifies a prompt that is working and must not be "improved" |
| **What was duplicated?** | the same file cited in two agents' evidence tables; the same question answered twice; a `researcher` spawned for something a later agent re-derived. From reports only — the transcript cannot show it |
| **What was missed?** | anything in the limits sections that nobody picked up afterwards; a `not met` verdict; a finding that survived the fix loop |
| **Was the fan-out real?** | the script's wave sizes. `1 → 1 → 1` where the plan had three independent tracks means the work was serialised by accident and the parallelism was theoretical |
| **Did the model mix hold?** | the spawn table's model column. `inherit` where the chain intends an override — e.g. `plan-verifier` pass 1 is supposed to be spawned as `sonnet` — is a silently more expensive run |
| **Where did the tokens go?** | subagent total vs main-session output. A main session much larger than the agents means the driver did work it should have delegated |
| **Was context reused?** | the cache read : created ratio. A low ratio on a long run means the context was being rebuilt |

## Step 5 — write it

Two destinations, and most retros write only the first.

**Always: append to the run file** `plans/NN-<feature>.run.md`, under
`## Retrospective`. Verbatim measured block, then the judged findings. This dies
with the run, and that is correct — most of it is not durable.

**Only when a finding clears the bar: append to the ledger,
`docs/retro/ledger.md`.**
The bar is the same four tests `engineering-insights` uses — non-obvious,
durable, actionable cold, grounded — plus one more that is specific to this
skill:

> **It names the change.** A retro finding that does not end in a concrete edit
> to a named file is an observation, not a finding. "The planner was vague" is
> nothing; "`implementation-planner.md` should require a placement decision per
> phase, because the implementer re-derived it three times" is a change someone
> can make.

Never edit an agent's prompt from inside this skill. Propose the diff; a human
applies it. An agent set that rewrites itself after every run drifts without
anyone deciding it should.

If nothing clears the bar, say so. One run is rarely enough to justify changing
a prompt, and a ledger full of single-run noise is how it stops being read.

## Output

Report the whole thing **in the chat** — that is where it gets read and argued
with. The ledger is the durable subset, not the delivery.

```markdown
## Retrospective — <feature or run>

<the script's `## Measured` block, verbatim>

### What the agents said they could not do
| Agent | Section | What it said | Picked up by anyone? |

### Judged
| Question | Finding | Evidence |
<Only rows with evidence. `no evidence` is a legitimate row.>

### Proposed changes
| # | File | Change | Why — from this run | Confidence |
<Each concrete enough to apply without asking. Confidence is `seen twice+` or
`provisional — one run`. Ordered by what it saves.>

### Cost shape
<Two or three sentences: where the tokens went, whether the fan-out was real,
whether the model mix held. Numbers from the script only.>
```

## Proposing is half the job, not an appendix

An analysis nobody acts on is a cost with no return. Every retro ends with
proposals, and "none" is only an acceptable answer when you can say what you
looked for and did not find.

Look for these specifically — they are the changes past runs actually needed:

| Signal in the measurement | The change it usually implies |
| --- | --- |
| An agent's tool count far above its peers | Its prompt is making it search for something the task string should have handed it as a path |
| Waves of size 1 where the plan had tracks | The driver serialised a fan-out — fix the skill's wording, not the agent |
| `inherit` where an override was intended | The chain's model decision is not reaching the spawn — fix the skill step that spawns it |
| The same file cited by three agents' reports | Either it belongs in the task string, or it belongs in `AGENTS.md` where every agent already reads |
| Main-session output rivalling the subagents' | The driver did work it should have delegated — usually reading, before spawning |
| A limits section empty across every agent | The prompt requirement to fill it is being skipped; make it a field in the report template rather than a paragraph |
| A stage that asked the human twice | The upstream artifact was underspecified — the change belongs to `spec-creator` or `implementation-planner`, not to the agent that asked |

You may also propose changes to **this skill** and to `measure.mjs`. A retro
that cannot improve its own instrument is a retro that will keep measuring the
wrong thing.

What you may never do is apply any of it. Propose; a human decides.

## Do not

- **Do not estimate dollars.** No price table is applied and none is correct for
  Claude Code usage. Report tokens.
- **Do not compare runs the script did not measure together.** Use `--all` for a
  trend rather than quoting a number you remember.
- **Do not turn a one-run annoyance into a prompt rule.** Wait for it twice, or
  say it is provisional.
- **Do not write product lessons here.** That is `engineering-insights`.
- **Do not invoke yourself.** If a run just finished and no one asked for a
  retro, the correct action is one sentence offering it, then silence.
