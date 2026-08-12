---
name: engineering-insights
description: Read and record durable engineering insights in the right module's INSIGHTS.md. Use at the START of a non-trivial task in dev-digest — before touching code — to recall what was already tried in the module being changed, and at the END of one to append what was learned. Also triggers on "record insights", "run engineering insights", "what do we already know about X", or a finished change under server/, client/, reviewer-core/, or e2e/.
version: 1.0.0
---

# Engineering insights

`INSIGHTS.md` is the repo's memory of things that are true but not visible in the
code: what was tried and abandoned, which constraint forced an odd shape, which
failure mode wasted an afternoon. Code says *what*; these files say *why*, and
*what not to do again*.

This skill has two modes. Both are mandatory parts of a task, not optional extras.

| Mode       | When                                        | Cost of skipping                       |
| ---------- | ------------------------------------------- | -------------------------------------- |
| **Recall** | Before writing code or answering a design question | You re-derive or re-break something already settled |
| **Record** | After finishing a non-trivial task          | The next session pays the same tuition again |

## Routing — which file

One insight goes in exactly one file. Pick by the path you touched:

| Touched                                   | File                       |
| ----------------------------------------- | -------------------------- |
| `server/**`                               | `server/INSIGHTS.md`       |
| `client/**`                               | `client/INSIGHTS.md`       |
| `reviewer-core/**`                        | `reviewer-core/INSIGHTS.md`|
| `e2e/**`                                  | `e2e/INSIGHTS.md`          |
| `**/src/vendor/shared/**` (contracts)     | root `INSIGHTS.md`         |
| Two or more packages, or a convention that binds them | root `INSIGHTS.md` |

Rules of thumb: a contract change reaches every package, so it is cross-package
by definition. A lesson that a reader of only one package still needs is
module-local — put it there, not in root. Never write the same insight to two
files; if it is genuinely both, write the general claim at root and leave the
module file alone.

Never write insights into `server/clones/**` (cloned user repos) or any
`src/vendor/**` file.

## Mode 1 — Recall

Run this before planning or editing, once you know which module the task lands in.

1. Read the routed module's `INSIGHTS.md` **in full** — they are short by design.
2. Read root `INSIGHTS.md` too if the task touches contracts, more than one
   package, or you are unsure which module it lands in.
3. Scan for anything covering the area you are about to change. Prefer
   **Decisions**, **What Doesn't Work**, and **Recurring Errors & Fixes** — those
   are the ones that stop wasted work.
4. If a hit exists, say so in your answer and cite it. An approach recorded under
   *What Doesn't Work* or *Rejected* is not to be retried without a stated reason
   for why the constraint changed.

Per `AGENTS.md`, this comes after `<module>/specs/` and `<module>/docs/` in the
reading order, and before the source.

## Mode 2 — Record

### Step 1 — Collect candidates

Look back over the task and ask, per item:

- What surprised me?
- What did I try that did not work, and why?
- What would I want told to me cold, before starting this task?
- Which decision looks arbitrary in the code and needs its constraint written down?

### Step 2 — Apply the bar

Record only what clears **all four**:

1. **Non-obvious** — not derivable by reading the code it describes.
2. **Durable** — still true next month; not a symptom of one broken branch.
3. **Actionable cold** — a stranger can act on it without this conversation.
4. **Grounded** — anchors to a real `path:line`, command, commit, or migration.

Do not record: routine changes, typo fixes, restatements of `AGENTS.md` or a
`README`, "we added feature X" (git history covers that), or anything you did not
personally verify this session. **If nothing clears the bar, write nothing and
say so.** Silence is a valid, expected outcome — noise costs more than an empty
section.

Prefer few, sharp entries over many hedged ones. Two solid entries beat six.

### Step 3 — Dedupe before writing

Read the target file again, right before writing. For each candidate:

- **Already there, same claim** → write nothing.
- **Already there, but your version is more specific or now has a `path:line`**
  → sharpen the existing entry in place. Keep its original date.
- **Contradicts an existing entry** → do not delete the old one. Add the new
  entry and state what changed and when the old one stopped holding.
- **New** → append it.

### Step 4 — Write, additively

**Non-negotiable: never overwrite, truncate, or rewrite an INSIGHTS.md.**

- Use `Edit`, never `Write`, on an existing `INSIGHTS.md`.
- Anchor the edit on the section heading or on the `_None yet._` placeholder of
  the one section you are adding to. Replace that placeholder only in that
  section — leave every other section's placeholder alone.
- Do not reword, reorder, re-date, or delete anyone else's entries.
- Newest first within a section.
- Sections are fixed. Add to the one that fits; do not invent new headings.

Sections, in file order: `Decisions` · `What Works` · `What Doesn't Work` ·
`Codebase Patterns` · `Tool & Library Notes` · `Recurring Errors & Fixes` ·
`Open Questions`.

Date with the **real current date** (`date +%F`), not a guess.

### Step 5 — Keep it bounded

Roughly 5 entries per section. If your addition pushes a section past that, do
not silently drop anything: pick the entry that has become stable reference
material, propose promoting it into that module's `docs/`, and only move it once
the user agrees. Pruning is a decision, not housekeeping.

## Formats

`Decisions` takes prose:

```markdown
### YYYY-MM-DD — <short title>

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what we tried or considered, and how it failed.
```

Every other section takes a dated bullet — claim first, anchor last:

```markdown
- **YYYY-MM-DD** — <the claim, specific enough to act on cold>.
  `src/path/to/file.ts:42`
```

## Calibration

Good — a stranger can act on it, and it is not in the code:

> **2026-08-05** — The `cost_usd` backfill in migration `0010` embeds a verbatim
> price snapshot copied out of `pricing.ts`, and that duplication is deliberate —
> do **not** DRY it up or refresh it when prices change. It reprices only rows
> that predate cost persistence; re-running it against current prices would
> silently rewrite history. `src/db/migrations/0010_....sql:3`

Bad — restates the diff, no constraint, nothing to act on:

> **2026-08-05** — Added a cost column to the pull request list and a
> `RunCostBadge` component. Works well.

## Reporting back

After recording, tell the user in a few lines: which files you appended to, which
section each entry landed in, and what you deliberately did **not** record
because it was already covered or did not clear the bar.
