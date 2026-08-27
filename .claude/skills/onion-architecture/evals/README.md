# Eval suite — onion-architecture

Compares the **live** skill against a **candidate revision** of it. Not on/off:
both arms get a skill, and the only difference between them is one added rule.

| Arm | Body |
| --- | --- |
| `v1-live` | [`../SKILL.md`](../SKILL.md) — what is in effect today |
| `v2-candidate` | [`variants/SKILL.v2.md`](variants/SKILL.v2.md) — v1 plus one new check |

The candidate lives here rather than replacing `SKILL.md`, so the live skill
stays untouched until the measurement says something. Promote it by copying it
over `SKILL.md`; then the next candidate becomes `SKILL.v3.md`.

## What v2 adds

One section, one checklist item, one version row: **a module is not a module
until it is registered in `src/modules/index.ts`.** It is the only failure in
this skill's scope that passes every gate — typecheck, `pnpm arch`, and the unit
suite all stay green while every route 404s. The rule is grounded in the
2026-08-16 entry in the root `INSIGHTS.md`, where Smart Diff shipped its
registration on a different branch and returned 404 when rebuilt alone.

## The fixture

One PR that adds a `webhooks` module: `routes.ts`, `service.ts`,
`repository.ts`, `constants.ts`. `src/modules/index.ts` sits in `baseline/` and
is **deliberately not touched by the case**, so it never appears in the diff —
which is the whole point of the plant, and also the reason the finding about it
has to cite `webhooks/routes.ts`: the grounding gate drops any finding whose
file is not in the diff, so "you forgot to change file X" must anchor on a file
that *is* there.

Nothing in the fixture hints at what is planted. The answer key is here.

| id | File | Planted | Owed by |
| --- | --- | --- | --- |
| `reg` | `webhooks/routes.ts` | the module is never added to the registry — inert, and green on every gate | **v2 only** |
| `routes-db` | `webhooks/routes.ts` | `GET /webhooks` builds a Drizzle query in the route, skipping service and repository | both |
| `repo-tx` | `webhooks/repository.ts` | the repository opens its own transaction instead of receiving the handle | both |
| `cross-module` | `webhooks/service.ts` | imports another module's internals (`../reviews/helpers.js`) | both |

`reg` carries `"arms": ["v2-candidate"]`: v1 is still *scored* against it, but
missing it is not a regression, because nothing in v1's text asks for it. A hit
there is reported as **beyond spec** — and that is exactly what happened.

The agent prompt in [`agent.md`](agent.md) is deliberately silent about the
registry. Naming it there would hand the v2-only rule to both arms and destroy
the comparison.

## Running

```sh
cd <repo root>/evals && npm install
npm run eval -- --suite onion-architecture
```

About $0.23 per arm on `claude-opus-5`.

## What 5 runs measured (2026-08-27, `claude-opus-5`, 5 reps per arm)

| plant | owed by | `v1-live` | `v2-candidate` |
| --- | --- | --- | --- |
| `routes-db` | both | 5/5 | 5/5 |
| `repo-tx` | both | 5/5 | **4/5** |
| `cross-module` | both | 5/5 | 5/5 |
| `helpers-impure` | both | 5/5 | 5/5 |
| `reg` | v2 | **5/5** (beyond spec) | 5/5 |
| `adapter-imports-module` | v2 | **5/5** (beyond spec) | 5/5 |
| `timeout` | v2 | **0/5** | 5/5 |
| `cost-guarantee` | v2 | **0/5** | 5/5 |

| | `v1-live` | `v2-candidate` |
| --- | --- | --- |
| unmatched findings per run | 9, 5, 8, 8, 6 | 3, 1, 2, 2, 2 |
| mean tokens in / out | 21013 / 7251 | 13651 / 3690 |
| skills slot | 8161 chars | 14467 chars |
| cost, 5 runs | $1.43 | **$0.80** |

**Two of the four v2-only rules discriminate; two do not.**

`timeout` and `cost-guarantee` are 0/5 against 5/5 — a clean split, five times
over. v1 does see the 300s constant, every run, but always as a different
problem: *"contradicts the module's 5s delivery budget"*, or an endpoint holding
a connection open. It never once names `JobRunner`. That is why this plant is
scored on the mechanism and not on the number — the first version of the pattern
asked only for `300_000` + `timeout` and handed v1 a pass it had not earned.

`reg` and `adapter-imports-module` do **not** discriminate: v1 caught both 5/5,
and for the right reason — its findings say *"a driven adapter must not depend on
a feature module's internals; imports point inward only"*, which is v1's own
dependency rule applied to a case it never spells out. A rule that a general
principle already implies is not worth writing down twice.

The delta that does show up everywhere is **noise and cost**: v1 filed a mean of
7.2 findings that matched no plant, v2 filed 2.0, and v2 did it on roughly half
the output tokens — $0.80 against $1.43 for the same five runs, from a prompt
almost twice as long. The skill made the review cheaper and quieter, not wider.

Two caveats on those numbers. "Unmatched" is not "wrong": both arms independently
flagged an unplanted SSRF hole in the webhook adapter, a real problem this
scorecard has no row for. And `repo-tx` at 4/5 in v2 is the reminder that one run
is an anecdote — the same plant is 5/5 in the arm with the weaker skill.

## No zero baseline

Both arms carry a skill. This suite declares `arms`, which **replaces** the
harness's default `without-skills`/`with-skills` pair rather than extending it
(`evals/run.ts`, `armsOf`), so nothing here measures what the agent prompt alone
would find. Add a `{ "name": "without-skills", "skills": [] }` arm when that
number is wanted; it costs one more arm's worth of runs.

If you add a case, add its rows above and to `expected.json`, and re-run
`./make-diffs.sh`. The table is what makes this suite a measurement rather than
a pile of violations.
