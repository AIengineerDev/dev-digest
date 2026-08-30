# Adopting the SDD chain in another repository

How to install this agent chain somewhere else — written for uSport, but the steps
hold for any repo. For how the chain works once installed, read
[`sdd-chain.md`](sdd-chain.md); this document is only about getting it there and
what has to change on the way.

The short version: **the chain is portable, the code-touching agents are not.**
Install `sdd-engineering`, expect to rewrite the paved-path skills, and plan to
build your own evals.

## 1 · Install

From inside the target repository:

```
/plugin marketplace add AIengineerDev/dev-digest-ai-marketplace
/plugin install sdd-engineering@dev-digest-ai-marketplace --scope project
```

`--scope project` writes to that repo's `.claude/settings.json`, so the install
travels with the repository rather than living on one machine. `sdd-engineering`
pulls `engineering-paved-path`, `research-tools` and `architecture-review` as
dependencies — you get all four whether you want them or not.

Verify: `/plugin` should list four plugins, and `spec-creator` should appear in the
agent list.

## 2 · Know what actually transfers

These agents and skills were written against dev-digest. Some describe a *method*
and travel intact; others hard-code a directory layout, a package manager and a
gate command. Measured by how often each file names something dev-digest-specific
(`server/src`, `pnpm arch`, `@devdigest`, `drizzle`, `check-shared`):

| Component | Coupling | Verdict for another repo |
| --- | --- | --- |
| `spec-creator` | none | **Use as-is.** It reads your repo and writes a spec |
| `researcher` | none | **Use as-is** |
| `engineering-insights` | none | **Use as-is** — it maps a touched path to the right `INSIGHTS.md` |
| `workflow-retro` | none | **Use as-is** |
| `run-plan` | 1 mention | **Use as-is.** One parenthetical about `check-shared.sh` you can ignore |
| `repo-conventions` | 1 | Nearly generic, but its content is dev-digest's conventions — **rewrite the body, keep the shape** |
| `doc-writer` | 3 | Works; will look for doc surfaces you may not have |
| `dependency-checker` | 3 | Assumes six packages and two package managers — **rewrite** |
| `plan-verifier` | 4 | Mostly method; check its gate examples |
| `frontend-ui-architecture` | 5 | Assumes `client/src` + App Router — **partly reusable for uSport**, which is also Next.js App Router |
| `implementation-planner` | 8 | Names dev-digest gates in its examples — **review its output carefully at first** |
| `implementer` | 12 | Runs dev-digest's gates — **must be told yours** |
| `architecture-reviewer` | 13 | Reviews *this* repo's onion + client rules — **do not trust its findings elsewhere until rewritten** |
| `onion-architecture` | 14 | Pure dev-digest: `server/src`, dependency-cruiser, a baseline of known violations — **do not install expectations on it** |

The two at the bottom are the trap. `architecture-reviewer` will confidently report
findings against boundaries your repo does not have.

## 3 · Create what the chain expects

The chain reads and writes four things. Create them before the first run:

```
specs/          # numbered specifications — specs/01-name.md
plans/          # plans/01-name.plan.md and plans/01-name.run.md
INSIGHTS.md     # what was tried and rejected
AGENTS.md       # your operating manual — CLAUDE.md symlinks to it
```

```bash
touch INSIGHTS.md AGENTS.md
mkdir -p specs plans
ln -s AGENTS.md CLAUDE.md     # one file, two names — they cannot drift
```

`AGENTS.md` is the important one. Every agent reads it, and it is where you state
the things no agent can infer: the stack, the gate commands, what is generated, what
must never be committed.

### For uSport specifically

uSport already has a task workflow — the CTO drops specs into `tasks/active/<id>.md`
after a voice session. That is **not** the same thing as `specs/`:

- `tasks/active/` is *an assignment* — do this next.
- `specs/NN-*.md` is *a specification* — numbered requirements `R1…Rn` and
  acceptance criteria a reviewer can check from outside.

Two workable arrangements:

1. **Keep both.** A task becomes the input to `/spec`, which writes the real
   specification. The task file stays the queue; the spec becomes the contract.
2. **Point the chain at `tasks/`.** Simpler, but `spec-creator` is fenced to
   `specs/` by a PreToolUse hook, so you would have to change the hook, and you lose
   the numbered-requirement discipline that `accept` checks against.

Take option 1. The task says *what to do next*; the spec says *what done means*.

## 4 · Tell the agents your gates

This is the step people skip, and it is the one that makes the difference between an
implementer that proves its work and one that guesses.

Put your real commands in `AGENTS.md`. For uSport:

```markdown
## Commands

| Task | Command |
| --- | --- |
| Lint + types (before every push) | `npm run lint && npm run type-check` |
| Build (routing, server components, config changes) | `npm run build` |
| Functions | `cd functions && npm run build` |

Tests are required for: new Cypher queries, new agent tools, new API routes.
There is no Makefile, no pytest, and no Python test suite — do not invent one.
```

The plan's phases will then name *those* commands as gates, and the implementer will
run them and report their real output. A plan whose gates are `pnpm arch` on a repo
with no dependency-cruiser produces an implementer that reports a green gate it
never ran.

Also state the hard constraints agents cannot infer — for uSport: no
Chinese-origin frameworks; `usport.ai` root is a separate repo and off-limits; the
COMMITTED_TO entity-resolution gap is known and must not be "fixed" opportunistically;
outreach emails are drafted to a file, never auto-sent.

## 5 · The two commands

`/spec` and `/ship` live in `.claude/commands/`. They are **not** part of the
plugin — copy them from this repo and edit:

```bash
cp .claude/commands/{spec,ship}.md <target-repo>/.claude/commands/
```

What to change in `ship.md` for uSport:

- the "commit before the review stage" note stays — it is universal
- the plan-verification step stays — it matters more, not less, in a new repo
- remove the `@devdigest/shared` / `check-shared.sh --fix` paragraph in the build
  stage; it describes a mirroring script uSport does not have
- if uSport gains a shared-contract mechanism later, put its equivalent back

Note `.gitignore` here excludes `.claude/*` with exceptions for `skills/`,
`agents/`, `hooks/` and `settings.json` — **not** `commands/`. Add
`!.claude/commands/` in the target repo, or the commands will not travel.

## 6 · Evals — you do not get these

`evals/` is a directory in this repository, not part of the plugin. Nothing about it
installs.

That matters because a skill, an agent and a routing file have **no type checker and
no test suite**. A broken description or a renamed agent fails silently, at routing
time, in someone else's session. Here, two harnesses cover that:

- `run.ts` — A/B over fixtures, needs an API key
- `eval.ts` — live sessions through your Claude login

and one free structural check, `pnpm eval:quality`, ~100 ms, the only one safe to
block CI on.

**Minimum viable version for a new repo:** start with the structural check alone. It
asserts things like *every skill has a description*, *every agent named in a routing
rule exists*, *no skill references a file that is gone*. That is cheap, catches the
failure mode that actually bites (a rename nobody propagated), and needs no model
calls. Add case-based evals only when you have a skill worth regression-testing.

Do not skip this and assume review will catch it. Review reads code; nothing reads a
prompt.

## 7 · First run

```bash
/spec add Stripe webhook retry with idempotency keys
#   → writes specs/01-stripe-webhook-retry.md, then STOPS
#   → read its ASSUMPTIONS section before continuing

/ship specs/01-stripe-webhook-retry.md
#   → plan → verify the plan → build → verify → review → accept → ship
```

Read the run file at `plans/01-*.run.md` afterwards, whatever the report says. On a
new repo the first two or three runs are as much about calibrating `AGENTS.md` as
about the feature: every time an agent guessed a command, a path or a convention,
that is a line missing from `AGENTS.md`.

## What to expect on a repo the agents have never seen

- **The first plan will be wrong in places.** It is grounded in a repo the planner
  read for the first time. `/ship` runs `plan-verifier` against the plan before
  building for exactly this reason.
- **`architecture-reviewer` will be noisy** until its rules describe your
  architecture. Treat its early findings as suggestions, not verdicts.
- **`accept` is the stage that pays for itself.** It is the only check against the
  *spec* rather than the plan, so it is the only one that catches a requirement the
  planner dropped.
- **Nobody writes tests in this chain.** `test-writer` is deliberately outside it.
  Whatever the plan's phases tell the implementer to write is the coverage you get,
  and the verifier's "not checkable here" list is the honest record of the rest.
