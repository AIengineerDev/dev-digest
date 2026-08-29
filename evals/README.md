# `@devdigest/evals`

Two harnesses live here. They answer different questions, authenticate
differently, and share nothing but this directory.

| | `run.ts` — A/B fixture harness | `eval.ts` — session harness |
| --- | --- | --- |
| Question | does attaching a skill change what the **reviewer** finds? | does the **harness** route, activate and dispatch correctly? |
| Runs | `reviewer-core`'s single-pass review over a checked-in diff | a real Claude Code session through the Claude Agent SDK |
| Auth | `ANTHROPIC_API_KEY`, else `~/.devdigest/secrets.json` | **your Claude login** — the same credential `claude` uses. No key. |
| Fixtures | inside the skill (`skills/<n>/evals/`) | outside it (`evals/**/fixtures/`) |
| Commands | `npm run eval`, `npm run delta` | `eval:quality`, `eval:skills`, `eval:agents`, `eval:workflow`, `eval:repeat`, `eval:delta`, `eval:benchmark` |

Both are documented below. `pnpm <script>` and `npm run <script> --` both work;
the package installs with **npm** (its lockfile is `package-lock.json`).

---

## The session harness — `eval.ts`

```
evals/
  quality.test.ts               # eval:quality — static, free, blocking
  eval.ts                       # the runner for the three session levels
  series.ts                     # eval:delta / eval:benchmark, over the records
  src/                          # session, grading, records, static checks
  skills/<name>/<name>.eval.ts    how the suite runs — arms, model, tools
  skills/<name>/<name>.cases.ts   prompts and expectations
  skills/<name>/fixtures/         untrusted test data
  agents/<name>/...
  workflow/...
  results/records.jsonl         # one line per (suite, case, arm, trial)
```

**Fixtures live outside the skill on purpose**, and this is the one place the
two harnesses disagree. The A/B harness keeps a suite inside the skill folder so
the skill stays deliverable as one directory. A session harness cannot: the
session reads the working tree, and a planted violation sitting inside the skill
it is being judged against reads as *reference material* — the model treats the
plant as an example of correct code. So `fixtures/` sits under `evals/`, and
every fixture README says it is untrusted test data.

### Three levels

| Command | Costs | What it proves |
| --- | --- | --- |
| `pnpm eval:quality` | nothing — no model, no key, no network | every skill and agent is well-formed: frontmatter, `name` matches its directory, internal links resolve, no stub bodies. **The only gate safe to block CI on.** |
| `pnpm eval:skills` · `pnpm eval:agents` | a session per arm per case | the CONTENT of one skill or agent, in isolation: `settingSources: []`, so no CLAUDE.md and no project skills leak into the measurement |
| `pnpm eval:workflow` | a session per case | ROUTING, against the live repo with project settings loaded: dispatch, positive and negative activation, and whether CLAUDE.md actually sends a session to the document it names |

```sh
pnpm eval:quality                                          # free, run it first
pnpm eval:skills --list                                    # what would run, no spend
pnpm eval:skills --suite onion-architecture --trials 2
pnpm eval:agents --arm v1-live --label baseline
pnpm eval:agents --arm v2-no-rule-citation --label version-b
pnpm eval:delta --a baseline --b version-b
pnpm eval:benchmark --label baseline
```

`eval:repeat` is the same runner with nothing preset, for a repeated series of
one configuration — it needs the level spelled out:

```sh
pnpm eval:repeat --kind agent --suite architecture-reviewer --arm v1-live \
  --trials 2 --label baseline
```

Flags: `--kind skill|agent|workflow` · `--suite` · `--case` · `--arm` ·
`--trials N` · `--label <series>` · `--model` · `--budget <usd>` ·
`--timeout <ms>` · `--list`.

`--budget` is a hard stop, not an estimate: the runner adds up what each session
actually cost and refuses to start the next one past the cap. `--list` spends
nothing and is the right first command in an unfamiliar suite.

### Evidence, not prose

A verdict is graded against the **trajectory** — the tool calls the session
made, the files it read, the subagents it dispatched, the skills it activated.
"I had the architecture-reviewer look at this" is a sentence; a
`Task(subagent_type: architecture-reviewer)` is a dispatch, and only the second
one passes a `kind: 'agent'` expectation. `kind: 'text'` exists for artefacts
whose whole output is prose, and it is the weakest evidence there is: a case
built only out of text patterns is a case the base model passes without the
skill.

`allowedTools` does **not** restrain a session — measured: a run listing only
`Read`/`Grep`/`Glob` still reached for `Bash`, burned every turn shelling around
the fixture and ended in `error_max_turns` with nothing graded. `disallowedTools`
is the half that blocks. Every suite here sets both.

### Control arms and what a delta means

An arm marked `control` is **supposed to miss** — `without-skill` measures what
the base model does on its own, and `v2-no-rule-citation` is a deliberate
degradation. Their misses are the measurement and never fail the run; only a
non-control arm's miss, or a session that produced nothing, sets a non-zero exit
code.

Read a delta **per expectation**, never as one score. "The score dropped" is not
a finding. "`cites-a-rule` went 5/5 → 0/5 and nothing else moved" is — and if
the change is diffuse instead, you are reading model variance, not your edit.

One trial is an anecdote. `--trials 2` is the cheap minimum and only 0/2 and 2/2
are readable; a 1/2 says the expectation is unstable and nothing more.

### Auth

`eval.ts` calls the Claude Agent SDK, which uses the Claude login already on
this machine. There is no `ANTHROPIC_API_KEY` in this path and no key to put in
CI — which is also why the model-run levels are not a fork-safe CI gate, and why
only `eval:quality` blocks there.

---

## The A/B fixture harness — `run.ts`

Answers one question per run: **does attaching a skill change what the reviewer
finds?** It runs the same agent over the same diff twice — once with the skill
bodies in the prompt's `skills` slot, once without — and scores both arms
against a checked-in answer key.

This package owns **no fixtures**. Every suite lives inside the skill it tests,
so a skill stays deliverable as one folder. Two skill roots are scanned, and
they are unrelated systems that share a word: `skills/` is **product data**
(skills the application manages for its users) and `.claude/skills/` is the
Claude Code skill directory. A suite may live in either, because a skill of
either kind is a body of text dropped into a prompt, and that is the only
property this harness cares about.

```
skills/<skill-name>/
  SKILL.md, *.md              # the skill itself
  evals/
    expected.json             # the answer key + which prompt and skills to attach
    baseline/                 # the "before" side of every diff
    cases/<id>/               # the "after" side, overlaid on baseline/
    diffs/<id>.diff           # generated by ./make-diffs.sh — what the model sees
    make-diffs.sh
    README.md                 # the scorecard, in prose
```

`run.ts` discovers a suite by the presence of `skills/*/evals/expected.json`.
Adding a suite means adding that directory — nothing here changes.

## Running

```sh
cd evals && npm install
npm run eval                                              # every suite, claude-opus-5
npm run eval -- --suite api-contract-reviewer --cases 01,03
npm run eval -- --model claude-haiku-4-5
npm run eval -- --suite onion-architecture --reps 5      # hit rate, not one sample
```

**One run is an anecdote.** The models worth testing here reject `temperature`,
so there is no seed to pin and no way to make a run reproducible. `--reps N`
runs each arm N times and reports a **hit rate per plant**: `5/5` is a rule the
reviewer holds, `2/5` is one it reaches sometimes, and the difference is
invisible from a single run. The exit gate follows that: a plant found in **no**
run fails the build, a plant found in some runs is reported as **flaky** and
does not — flakiness is a property of the model, not a broken gate.

The key comes from `ANTHROPIC_API_KEY`, falling back to
`~/.devdigest/secrets.json` — the same store the server reads. Each run writes a
timestamped report to `results/` — `<stamp>.md` to read and `<stamp>.json` with
every run's raw findings — and prints the scorecard table.

Keep the JSON. The scorecard is regexes over model prose and it *will* need
tightening once a run shows it crediting the right file for the wrong reason;
when that happens you re-score the saved findings instead of paying for the runs
again.

**Exit code is the gate:** `1` if any arm missed a planted change or failed to
produce a review, `0` otherwise. That is what CI would key on.

A run costs real money: roughly $0.10 per arm on `claude-opus-5` and $0.02 on
`claude-haiku-4-5`, so a full eight-arm sweep of the one existing suite is about
$0.80 and $0.15 respectively.

## What `expected.json` declares

```jsonc
{
  "agent": {
    "prompt": "seed:API_CONTRACT_REVIEWER_PROMPT",
    "skills": ["seed:breaking-change", "file:../deprecation-policy.md"]
  },
  "cases": [{ "id": "…", "title": "…", "expected": [{ "id": "…", "file": "…", "patterns": ["…"] }] }]
}
```

`seed:` resolves an export of `server/src/db/seed-api-contract.ts` (a skill that
ships in the DB seed); `file:` is read relative to the suite directory (a skill
that ships as a document).

`agent.skills` gives the default **on/off** pair. To compare two revisions of a
skill instead, declare named arms — the live body against a candidate:

```jsonc
"arms": [
  { "name": "v1-live",      "skills": ["file:../SKILL.md"] },
  { "name": "v2-candidate", "skills": ["file:./variants/SKILL.v2.md"] }
]
```

An expectation may then carry `"arms": ["v2-candidate"]`, meaning only that arm
is **owed** it. The other arm is still scored against it, and a hit there is
reported as **beyond spec** rather than counted as a pass — which is how you
find out that a rule you were about to add was already being caught without it.

A planted change counts as found when one grounded finding cites a file matching
`file` and its title + rationale + suggestion match every regex in `patterns`.
Deliberately loose on wording and strict on location: the point is whether the
reviewer saw the thing, not whether it phrased it our way.

Assignment is **one-to-one**, most-constrained-first: an expectation with a
single candidate finding claims it before an expectation with three gets to
choose, and no finding is ever credited to two plants. Independent first-match
per expectation was the original implementation and it lied in both directions
on the first run that exercised it — see the `Recurring Errors & Fixes` entry in
the root `INSIGHTS.md`.

## Dependencies, and the two it does not have

This package depends on the **engine** (`@devdigest/reviewer-core`) and the
**contracts** (`vendor/shared`) through tsconfig path aliases. It does **not**
depend on `server/` or on a database — no seeding, no running API, no Postgres.

Two server files are imported, and only two, both leaves that pull nothing in
with them: `src/adapters/git/diff-parser.ts` (one `import type` line) and
`src/db/seed-api-contract.ts` (no imports at all). The parser is imported rather
than copied because it decides which lines the grounding gate will accept, and a
drifted copy would silently change every score.

`src/anthropic.ts` **is** a near-copy of the server's Anthropic adapter, and
that is the deliberate exception — importing the real one would drag
`platform/resilience`, `platform/errors` and the pricing table in, and with them
the whole server package. Both are pinned to `@anthropic-ai/sdk ^0.33.1` so the
two copies cannot drift on SDK shape. Two behaviours in it are load-bearing:
models from Opus 4.7 on reject `temperature` outright, and structured output is
a forced tool call whose schema failures are re-prompted through a `tool_result`.

Like `reviewer-core` and `mcp`, this package never emits JS — `build` is a
typecheck. A package that path-aliases into `server/src/vendor/shared` cannot
emit (root `INSIGHTS.md`, 2026-08-11).

## Wiring it into CI

Not wired yet. When it is, three things are not optional:

1. **Not a `pull_request` gate.** The runs cost money and are non-deterministic.
   `workflow_dispatch` + a nightly `schedule`, or a `run-evals` label.
2. **`npm ci` in `reviewer-core` first.** This package type-checks against
   `../reviewer-core/src`, so tsc resolves that package's own bare imports
   (`openai`, `zod`) against `reviewer-core/node_modules`, which nothing else
   installs. `server-unit.yml` already carries this workaround and the comment
   explaining it.
3. **Path filter on `skills/**` as well as `evals/**`.** A change to a skill
   body must re-run the eval — that is the entire point.

`ANTHROPIC_API_KEY` comes from repo secrets; exit early when it is empty so
forks do not fail red. Upload `results/*.md` as an artifact rather than reading
it out of the log.
