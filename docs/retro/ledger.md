# Retro ledger — lessons about the agent system

What we learned about **how the agents work together**, from real runs. Written
by the `retro` skill, which a human invokes deliberately — nothing appends here
automatically.

## What belongs here

Findings that would help someone changing `.claude/agents/*.md` or
`.claude/skills/*`: which agent struggled and why, what two agents duplicated,
which prompt asked for the wrong thing, where a hand-off lost information.

## What does not

- **Product lessons** — anything useful to someone changing `server/`,
  `client/`, `reviewer-core/` or `e2e/`. Those go to the module's `INSIGHTS.md`
  through the `engineering-insights` skill.
- **How the system works today.** That is the rest of `docs/`. This file is a
  running record, not reference material, so the usual `docs/` rule — delete it
  when it goes stale — does not apply: an entry is a dated observation about a
  run that happened, and stays true about that run.
- **A single run's annoyance.** One run rarely justifies changing a prompt. Wait
  for it twice, or mark the entry provisional.

## The bar

The four `engineering-insights` tests — non-obvious, durable, actionable cold,
grounded — plus one that is specific to this file:

> **It names the change.** An entry that does not end in a concrete edit to a
> named file is an observation, not a finding. "The planner was vague" is
> nothing. "`implementation-planner.md` should record a placement decision per
> phase, because the implementer re-derived it three times in run 09" is a
> change someone can make.

Proposing the edit is this skill's job; **applying it is a human's**. An agent
set that rewrites itself after every run drifts without anyone deciding it
should.

## Format

Newest first. Every entry names the run it came from, so a claim can be
re-checked rather than believed.

```markdown
### YYYY-MM-DD — <short title>

**Run:** `plans/NN-<feature>.run.md` · <N agents, M tokens — from measure.mjs>
**Observed:** what happened, with the evidence that settles it.
**Change:** `<file>` — the concrete edit.
**Status:** proposed | applied YYYY-MM-DD | rejected, because …
```

---

### 2026-08-29 — worktree fan-out cost 2.5× more than it saved to set up

**Run:** `plans/14-multi-agent-review.run.md` + `plans/15-export-to-ci.run.md` ·
21 agents, 1,960,647 subagent tokens, 3h35m wall clock

**Observed.** Two features were built in two git worktrees to run them in
parallel. Measured build-stage agent time, per track:

| | |
| --- | --- |
| Export to CI — PR A (phases 1–2) | 17.5 min |
| Export to CI — PR C (phases 3–7) | 26.5 min |
| **Track total** | **44.0 min** |
| Multi-Agent Review — all 10 phases | **65.5 min** |
| Sequential (sum) | 109.5 min |
| Ideal parallel (max) | 65.5 min → **44 min, 40%, available** |
| Actually overlapped | 17.5 min → **16% realised** |

Only PR A ever ran concurrently with Multi-Agent Review. PR C started after a
human decision, an hour later, so two of the three builds were serial in
practice. Across the whole chain the arithmetic is worse: 222 min of summed
agent time against 215 min of wall clock — parallelism recovered about 3%,
because verify, review and the fix loop are serial *per feature* regardless of
how many worktrees exist.

Two causes, and the second is the interesting one:

1. **The tracks were unbalanced 1.49:1.** A fan-out's wall clock is `max(track)`,
   never `sum(track)`, so the ceiling was set entirely by the longer branch.
2. **Both plans said `**Execution mode:** single implementer`.** The fan-out was
   therefore *across* two features, which nobody chose — it fell out of there
   being two specs. The split that would have paid was *inside* plan 14: its
   server phases 1–5 and client phases 6–10 share no files. Nothing in the chain
   proposed that, because `implementation-planner` asks "single implementer or
   parallel tracks?" once, per plan, before it knows how big the phases are.

**Change.** `sdd-engineering/agents/implementation-planner.md` — when it answers
the tracks question, require it to state each proposed track's phase count and
its estimated share of the work, and to say plainly when the largest track is
more than ~1.3× the smallest, because the saving is bounded by the largest one.
A plan that declares `single implementer` should also record *why* a within-plan
split was rejected, so the decision is visible rather than defaulted.

**Status:** proposed

**Caveat.** The sequential figure is a counterfactual computed from measured
per-agent durations, not a second run. It excludes the ~40 min lost to three
watchdog kills on PR C, which would have been lost either way.

---

_Entries above this line are written by a deliberate `/workflow-retro`, or by a
human asking for one. Nothing appends here automatically._
