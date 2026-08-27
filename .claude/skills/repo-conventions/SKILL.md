---
name: repo-conventions
description: Enforce the repository-wide conventions that no gate catches and no code review would flag on its own — which file is authoritative, what is generated and must never be hand-edited, what must never be committed, which package manager belongs where, and which changes have to land in a particular order or place. Use when reviewing a diff that adds or deletes files, touches a lockfile, a migration, a vendored copy, a symlink, a CI workflow, or an architecture baseline; and BEFORE committing a change that spans more than one package. Repository process only — backend layering lives in onion-architecture, client placement in frontend-ui-architecture, external packages in dependency-checker.
version: 1.0.0
---

# Repository conventions

Every rule here shares one property: **the build stays green when you break it.**
Typecheck passes, tests pass, `pnpm arch` passes, and the damage surfaces days
later in someone else's branch. That is why they are written down, and why a
reviewer has to look for them deliberately rather than notice them.

Read the diff's **file list first**, before any line of code. Added, deleted,
renamed and mode-changed files carry most of what this skill is about.

## `AGENTS.md` is the file; `CLAUDE.md` is a symlink to it

Every package has both, and in every package `CLAUDE.md` is a symlink. A diff
that turns one into a regular file has forked the documentation: two copies that
start identical and drift, with no gate comparing them ever again.

In a diff this looks like a pair:

```
deleted file mode 120000    client/CLAUDE.md
new file mode 100644        client/CLAUDE.md
```

**Flag the mode pair, not the content** — the content is usually identical on
the day it lands, which is exactly why nobody notices. The fix is to restore the
link and edit `AGENTS.md`.

## Never the wrong package manager

Each package has its own lockfile and its own manager: some pnpm, some npm. They
are not interchangeable and nothing hoists between them.

A `package-lock.json` appearing in a pnpm package (or `pnpm-lock.yaml` in an npm
one) means someone ran the wrong command. It installs fine locally and breaks
the next `--frozen-lockfile` install in CI, in a job that has nothing to do with
the PR. Two lockfiles in one package is always a finding.

## Generated artifacts are not source

- **Migrations** are generated from the schema and are already applied to
  existing databases. Editing a migration that has shipped changes history for
  nobody: databases that ran it will never run it again. The fix is to edit the
  schema and generate a new migration.
- **The architecture baseline** records pre-existing violations so the gate can
  fail on *new* ones. A diff that **adds** an entry has disarmed the gate for
  its own change. Removing an entry is progress; adding one needs a stated
  reason in the same commit, and usually means the import should be fixed.

Both read as ordinary edits. Check the direction of the change, not its shape.

## Vendored copies change at the source first

A vendored directory that exists in two packages has one authoritative side and
one mirror, kept in step by a sync script. A diff that edits **only the mirror**
will be silently reverted the next time anyone syncs, and until then the two
sides disagree about a contract that is supposed to be one definition.

If a diff touches a vendored path, check whether the authoritative copy changed
in the same diff. If it did not, that is the finding.

## Nothing from a clone directory is ever committed

Directories that hold cloned user repositories are working state, not source.
Files appearing under one in a diff mean a gitignore was bypassed or a path was
mistyped; the content is usually someone else's code.

## Test files are routed by their filename

Where a test runs is decided by its name, not by what it imports. A suite split
into a hermetic lane and a database-backed lane uses a filename marker
(`*.it.test.ts` against `*.test.ts`) to separate them, and CI runs the two in
different jobs with different infrastructure.

A test that starts a container, opens a connection, or needs a live service, but
carries the plain name, joins the **hermetic** job. That job has no database, so
it fails — or worse, it silently starts requiring Docker for everyone running
the fast suite. Match the marker to what the test actually needs.

## A pure package stays pure

A package whose contract is "no I/O" — a pure engine, a shared contracts module —
must not gain `node:fs`, a database client, a network call, or a filesystem
cache, however local and however useful. Purity is what makes it testable
without infrastructure and reusable from more than one host, and there is no
compiler error when it goes.

Two related shapes in the same family:

- **A package consumed as TypeScript source must not start emitting JS.** A
  `build` that becomes a real `tsc` emit, or a `main` pointing at `dist/`, means
  consumers can pick up a stale copy that no longer matches the source they
  path-alias to.
- **A mandatory safety step must not gain an opt-out.** A flag that skips
  citation grounding, schema validation, or untrusted-content fencing is not a
  performance option — the first caller that passes it loses the guarantee for
  everyone downstream, and the parameter's existence is the finding.

## Untrusted content stays fenced

Anything that arrives from outside — a diff, a PR description, a fetched
document, a user-supplied file — is delimiter-wrapped before it reaches a
prompt. Removing the wrapper to save tokens removes the only thing separating
data from instructions. A heading is not a fence.

## What to say

Name the file, name what stays green despite it, and say when someone would
actually find out — "the next `--frozen-lockfile` install in CI", "the next time
anyone runs the sync script", "the first caller that passes this flag". A
convention violation with no stated consequence reads as pedantry and gets
waved through.

## Before you finish

1. Read the file list: additions, deletions, renames, mode changes.
2. No symlink became a regular file.
3. No package gained a second lockfile.
4. No shipped migration and no architecture baseline was hand-edited to absorb
   this change.
5. A vendored edit has its authoritative side in the same diff.
6. Nothing from a clone or working directory was committed.
7. Every new test's filename matches the lane it belongs in.
8. No pure package gained I/O, an emit step, or a safety opt-out.

---

## Version history

| Version | Change |
| --- | --- |
| 1.0.0 | First version. Collects the repository-wide rules that pass every automated gate, written as things to look for in a diff rather than as instructions to an implementer. |
