# API Contract Reviewer — skills

The agent that demonstrates what skills change about a review: without them, a
general reviewer reads a renamed response field as tidy-up; with them it reads
the same diff as a breaking change to a published contract and says who it
breaks.

| Skill | Where it lives | Why there |
| --- | --- | --- |
| `breaking-change` | `pnpm db:seed` | seeded, so a fresh workspace has the agent working |
| `response-schema` | `pnpm db:seed` | " |
| `semver-discipline` | `pnpm db:seed` | " |
| `deprecation-policy` | **this folder** | imported through `POST /skills/import`, so the import path is exercised by a real document at a real URL |

The seeded three are in
[`server/src/db/seed-api-contract.ts`](../../server/src/db/seed-api-contract.ts).

## Importing the fourth

```sh
curl -X POST localhost:3001/skills/import \
  -H 'content-type: application/json' \
  -d '{"url":"https://raw.githubusercontent.com/<owner>/<repo>/<branch>/skills/api-contract-reviewer/deprecation-policy.md","type":"convention"}'
```

The name and description are derived from the document's first heading and first
line when they are not supplied. The skill is stored with
`source: 'imported_url'`, which is what makes the assembler wrap its body in
`<untrusted>` before it reaches a prompt: a document fetched from the internet is
data, not instruction, however sensible it reads. Link it to the agent **fourth**
in the Skills tab — it is the remedy, and it only makes sense once the first
three have named the problem.

## The experiment these are for

1. Open a PR that renames a response field or changes a route signature.
2. Review it with an agent that has **no** skills linked.
3. Link these four to the `API Contract Reviewer` and review the same PR again.

The difference between the two runs is the argument for skills, and it is
visible in the run trace: the second run's `## Skills / rules` slot is non-null
and carries the token cost of these bodies.

## Measuring it instead of asserting it

[`evals/`](./evals) — this folder's own eval suite — is that experiment,
checked in and repeatable: nine planted
contract breaks across three diffs plus an additive control, an answer key, and
a harness that runs both arms and scores them.

The harness that runs it is the repo-root `evals/` package:

```sh
cd <repo root>/evals && npm install
npm run eval -- --suite api-contract-reviewer
```

Read [`evals/README.md`](./evals/README.md) for what is planted and what the
first runs measured. The short version, and it is not the flattering one: on
`claude-opus-5` and `claude-haiku-4-5` **both arms found all nine**. The claim
that an unskilled reviewer reads the rename as tidy-up holds against the cheap
default model these skills were written for (`deepseek/deepseek-v4-flash`), not
against Claude — there, the skills changed the vocabulary of the finding and
roughly halved the output tokens, but not what was found.
