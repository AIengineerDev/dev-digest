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
2. Review it with an agent that has **no** skills linked — the rename reads as
   cleanup and is not reported.
3. Link these four to the `API Contract Reviewer` and review the same PR again —
   the rename is reported as a breaking change, with the callers it breaks and
   the deprecation window it needs.

The difference between the two runs is the whole argument for skills, and it is
visible in the run trace: the second run's `## Skills / rules` slot is non-null
and carries the token cost of these bodies.
