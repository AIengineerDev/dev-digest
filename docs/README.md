# docs/ — cross-package

Reference material describing how the system works **today**, across more than
one package. Human-first prose and diagrams; agents read it on demand via the
`Read when` pointers in `../AGENTS.md`.

| Path             | What                                                         |
| ---------------- | ------------------------------------------------------------ |
| `sdd-chain.md`   | Spec → shipped: every agent in the chain, the two commands, the rules that bite |
| `adopting-the-chain.md` | Installing this chain in another repository — what transfers, what must be rewritten |
| `agent-prompts/` | System prompts for the built-in reviewers + model choice notes |
| `retro/`         | Running ledger of what we learned about the agent system itself |
| `retro/*-session-log.md` | Raw per-session material for a later `/workflow-retro` — evidence, not findings |

Package-local reference material goes in `<package>/docs/`.

Rules:

- Do not restate `README.md`. Link to it.
- Do not put intent here — that is `specs/`. Do not put rejected approaches here
  — that is `INSIGHTS.md`.
- `retro/ledger.md` is the one exception to the rules above: it is a dated
  record of runs that happened, not a description of the system today, so it
  is appended to and never pruned for staleness.
- If a doc goes stale, delete it. A wrong doc costs more than a missing one,
  because `AGENTS.md` points agents at it as curated truth.
