# Dependency report — <repo> — <YYYY-MM-DD>

**Headline:** one sentence. The single thing a developer must act on, or
"nothing needs action" if that is the honest answer.

Measured with `scripts/survey.sh` on <date>, <machine/OS>. Excludes
`server/clones/**`.

## 1. The map

<one mermaid diagram: solid = tsconfig path alias, dashed = same package
declared independently in both. Annotate only what changes a decision.>

| Package | Manager | Prod / dev | node_modules | Weight that matters |
| --- | --- | --- | --- | --- |
| | | | | |

## 2. Weight

State the unit before the numbers. Disk size and bundle bytes are different
claims and are never mixed in one table.

### On disk

| Package | Total | Top 3 | Native/platform artifacts |
| --- | --- | --- | --- |

### Shipped to the user

<client bundle figures, or the explicit line: "not measured this pass — the
disk numbers above do not answer this.">

## 3. Disagreements

| # | Dependency | Where | Disagreement | Crosses an alias edge? | Rank |
| --- | --- | --- | --- | --- | --- |

<For each P0/P1 row, a paragraph: what breaks, when, and what makes it hold
together today.>

## 4. Action list

Ranked P0 → P3. Nothing without a command and a gate.

| # | Rank | Action | File / command | Cost | Gate that proves it |
| --- | --- | --- | --- | --- | --- |

## 5. Not measured

What this pass did not look at, and why. Bundle analysis, transitive trees,
licences, advisories, install timings — name each one that was skipped.

## 6. Watch list

Things that are fine today and will not stay fine: a range that will drift on
the next install, a dependency one major behind, a package with a single
maintainer on a critical path. One line each, no action required yet.
