# Insights — reviewer-core

Engine decisions and dead ends. Read before changing prompt assembly, structured
output, or grounding — the constraints here are deliberate.

Read at the start of a task, written at the end of one, by the
`engineering-insights` skill. Sections are fixed — add to the one that fits,
newest first. If it would be obvious to anyone reading the code, leave it out.

Formats — `Decisions` takes prose; every other section takes a dated bullet:

```markdown
### YYYY-MM-DD — <short title>

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what we tried or considered, and how it failed.
```

```markdown
- **YYYY-MM-DD** — <the claim, specific enough to act on cold>.
  `src/path/to/file.ts:42`
```

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here.

---

## Decisions

### 2026-07-31 — Mechanical grounding gate, not a trusted model

**What:** every finding must cite a real line in the diff or it is dropped, and
the verdict score is recomputed from the surviving findings.
**Why:** the model reliably invents plausible line references, and a citation
check is verifiable where a self-reported confidence is not.
**Rejected:** trusting the model's own locations and score. Findings pointed at
lines that were not in the diff, and the score did not move when they were
removed.

## What Works

- **2026-08-09** — The derived-intent per-band preamble text (specs/04-intent-
  layer.md §6 — "Derived from the PR's description…" / the `low`-band warning
  that it must never suppress a finding) lives ONLY in `reviewer-core/src/
  prompt.ts` (`intentBandPreamble`), even though the LLM classification prompt
  that PRODUCES the intent lives server-side in `server/src/modules/reviews/
  intent-prompt.ts`. It was written once server-side too and then deleted —
  keep it that way: the preamble is TRUSTED text rendered outside the
  untrusted wrapper by `assemblePrompt` itself, so it has exactly one place to
  drift from `INJECTION_GUARD`'s wording. `src/prompt.ts:39` (`intentBandPreamble`).

## What Doesn't Work

_None yet._

## Codebase Patterns

_None yet._

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Open Questions

_None yet._
