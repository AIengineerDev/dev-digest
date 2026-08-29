# Research Tools

One agent that answers a research question and reports back with evidence —
from inside your repository, or from the web when the answer is not in it.

It is read-only. Its output is the report and nothing else.

## Install

```
/plugin marketplace add AIengineerDev/dev-digest
/plugin install research-tools@devdigest-tools
```

No dependencies. It brings nothing else with it.

## Use it for

**Inside the repository**
- How does X work · where is Y decided · when did Z change
- What already exists here before I build something that duplicates it

**Outside it**
- Does `<library>` support this · what changed between these two versions
- What does this spec actually say · why does this error happen when nothing local explains it

## Do not use it for

- **Making a change.** It never edits a file.
- **A single fact you could grep yourself.** Dispatching an agent to find one
  string costs more than finding it.

## Why it has no skills

This agent carries no dependency on the paved-path skills, deliberately: it has
no `Skill` tool, so none of them would be reachable from it. A dependency that
installed five skills the agent cannot invoke would be noise you would then be
blocked from removing.

It reads, greps, globs, runs read-only shell, and fetches from the web. That is
the whole surface.

## What a good report looks like

Claims first, evidence last, and an explicit *could not establish* section. An
answer that does not distinguish between what was verified and what was inferred
is worse than no answer, because it spends your trust without earning it.
