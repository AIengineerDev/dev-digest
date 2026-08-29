# Architecture Review

One read-only agent that judges a change against the layering and placement rules
the paved path defines, and reports what it finds with file-and-line evidence.

It reports. **It never fixes.** That separation is the whole design: a reviewer
that edits is a reviewer whose findings nobody audits.

## Install

```
/plugin marketplace add AIengineerDev/dev-digest
/plugin install architecture-review@devdigest-tools
```

This also installs **`engineering-paved-path`**, which holds the rule sets this
agent judges against. It cannot work without them, so it declares the dependency
rather than hoping they are present.

## Use it for

- "review the architecture" · "check the layering" · "did this break the boundaries"
- "architecture review of `<paths>`"
- After an implementer lands a change that adds a module, a route, an adapter or a screen

## What it will tell you, and what it will not

| Reports | Sends elsewhere |
| --- | --- |
| Import direction violations | Correctness bugs — not an architecture question |
| A file in the wrong layer or folder | Security — bring a security reviewer |
| A module that has outgrown its shape | Whether the code matches a plan — that is `plan-verifier` |
| Transaction ownership and error translation at the wrong boundary | A hand-edited migration, a second lockfile, a symlink replaced by a copy — that is `repo-conventions` |

A finding without a path and a line is not a finding. If the agent cannot show
you where, it does not report it.

## How it decides

It invokes `onion-architecture` for backend code and `frontend-ui-architecture`
for frontend code, and judges against what those skills actually say — not
against a general sense of good architecture. When those rule sets change, this
agent's verdicts change with them, and no prompt here needs editing.

One half of the review is mechanical and one half is not: backend layering is
usually backed by an enforceable dependency gate, while frontend placement is
judgement. The agent says which is which rather than presenting both with the
same confidence.

## Cost

It runs on a mid-tier model on purpose. Its output format already forbids an
unevidenced verdict, so the format does the constraining and a larger model buys
little.
