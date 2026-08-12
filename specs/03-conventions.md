# Conventions Extractor — house rules, mined from the repo, promoted to skills

**Status:** shipped
**Packages touched:** server, client, `@devdigest/shared`
**Design:** [`design-mocks/src/25-screen_conv_conf.jsx`](../design-mocks/src/25-screen_conv_conf.jsx)
(N7 Conventions extractor)
**Depends on:** [`02-skills.md`](02-skills.md) — a convention is only useful once
it can become a skill and a skill can reach a prompt.

---

## Problem

Skills are written by hand. Every repo already *has* house rules — they are just
implicit in the code, and a reviewer agent has no way to learn them short of
someone writing each one out. Meanwhile `repo-intel` already knows which files
matter most in a repo (`file_rank`), and the `conventions` table has existed,
empty and unwritten, since the schema was laid down
([`schema/knowledge.ts:31`](../server/src/db/schema/knowledge.ts)).

So: scan a repo, propose candidate rules with evidence, let a human accept or
reject each one, and turn the accepted set into a `repo-conventions` skill that
an agent can be linked to.

## The part that decides whether this is useful

An LLM asked "what are this repo's conventions" will produce plausible rules
that are not this repo's, cite files that do not exist, and quote code it wrote
itself. **The model's output is a hypothesis, never a finding.** Every candidate
passes a code-side gate before a human ever sees it:

1. Its `evidence_path` must be one of the files we actually sampled — a path the
   model never saw cannot be evidence.
2. That file must be readable in the clone.
3. Its `evidence_snippet` must occur in that file, compared with whitespace
   normalised (models re-indent).
4. Its `evidence_line` must be where the snippet actually is. A wrong line is
   **corrected**, not fatal — the snippet is the claim, the line is a pointer.
5. Low-confidence candidates (`< 0.5`) are dropped before persisting.

Anything that fails 1–3 is discarded and counted. The count is reported so the
extraction's own precision is visible instead of being folded into the results.

This is what makes the evidence link clickable and honest: `full_name` + the
`head_sha` recorded at extraction time + `path#Lline` is a permalink to the code
the claim was made about, not to whatever that file says today.

## Scope

**In**

- `POST /repos/:id/conventions/extract` — sample, ask a cheap model, verify,
  persist. Replaces the previous pending set for that repo; decided candidates
  survive a re-scan.
- List / accept / reject / edit a candidate.
- `POST /repos/:id/conventions/skill` — merge the accepted set into one skill
  (`source: 'extracted'`, `evidence_files` populated), editable before save.
- One client surface at `/repos/:repoId/conventions`.

**Out**

- Conformance report (N8 in the same mock) — a different feature that happens to
  share a screen file.
- Re-running extraction incrementally per commit. A scan is a whole-repo act.
- Ranking or clustering candidates beyond the confidence the model reports.

## Sampling — code, not the model

`repoIntel.getConventionSamples(repoId, 12)` gives the top-12 ranked files with
tests, configs and migrations already filtered out
([`repo-intel/service.ts:630`](../server/src/modules/repo-intel/service.ts)).
Config files are added separately by name (`eslint*`, `tsconfig*`, `.prettierrc*`,
`.editorconfig`, `package.json`) because rank deliberately excludes them and they
are where half the conventions are stated outright.

Each sampled file is sent line-numbered and truncated to a per-file character
budget, so the model can cite a line number it can actually see. The set of
sampled paths is also the allowlist in gate 1 above.

## Contract changes — `@devdigest/shared` first

`ConventionCandidate` exists already but is the mock's shape (no line, no
category, `accepted: boolean`). Replace it with:

```ts
ConventionCategory  // naming | structure | error-handling | testing | typing
                    // | api | async | logging | imports | security
ConventionStatus    // pending | accepted | rejected
Convention          // id, repo_id, category, rule, rationale, evidence_path,
                    // evidence_line, evidence_snippet, confidence, status,
                    // head_sha, created_at
ExtractConventionsResult  // { sampled_files, proposed, verified, dropped, conventions }
UpdateConventionInput     // { rule?, category?, status? }
CreateSkillFromConventionsInput // { name, description, type, body?, convention_ids? }
```

`status` replaces `accepted` because "not yet looked at" and "looked at and
rejected" are different facts, and only the second should survive a re-scan.

## Server

One module, `server/src/modules/conventions/`, per `onion-architecture`. It
earns a service: extraction is a multi-step rule (sample → prompt → verify →
replace-pending) and skill creation spans two modules' tables.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/repos/:id/conventions` | `?status=` |
| POST | `/repos/:id/conventions/extract` | the scan; returns the verification counts |
| PATCH | `/conventions/:id` | rule / category / status |
| POST | `/repos/:id/conventions/skill` | accepted set → one skill |

The model call goes through `resolveFeatureModel(container, ws, 'conventions')`,
which already exists and already has a registry default — no new model constant.

Skill creation goes through `container.skillsWriter` rather than importing the
skills service across modules (the `container.skills` precedent from 02). The
writer is new: `SkillsService.create` was moved onto it so both entry points
share one body limit and one v1-snapshot transaction.

## Acceptance criteria

1. `POST .../extract` on an indexed repo returns candidates, and every persisted
   candidate's snippet is present in the file it names, at the line it names.
2. A candidate citing a file outside the sampled set, or a snippet not in that
   file, never reaches the database; the response says how many were dropped.
3. Accept / reject / edit persist and survive a re-scan; pending candidates do
   not.
4. The skill built from the accepted set contains every accepted rule and no
   rejected one, carries `source: 'extracted'` and `evidence_files`, and can be
   linked to an agent from the Agent Editor.
5. Each evidence line in the UI links to `github.com/<full_name>/blob/<head_sha>/
   <path>#L<line>` and resolves to the quoted code.
6. `pnpm arch`, `./scripts/check-shared.sh`, both typechecks and both test suites
   are green.

## Open questions

1. **Re-scan semantics.** Pending rows are replaced; decided rows are kept and a
   re-proposed duplicate is suppressed by exact `rule` match. Fuzzy dedupe is
   deliberately not attempted — it would silently hide a sharper restatement of a
   rule someone rejected once.
2. **One skill or many.** v1 merges the accepted set into a single
   `repo-conventions` skill. Per-category skills are a UI grouping away, but
   nothing in the data model prevents it later.

## Shipped — what landed, 2026-08-09

| Piece | Where |
| --- | --- |
| Contracts | `server/src/vendor/shared/contracts/knowledge.ts` (mirrored by `check-shared.sh --fix`) |
| Table | `conventions`, migrations `0012` (columns) + `0013` (drops the unused `accepted` boolean) |
| Module | `server/src/modules/conventions/` — `prompt.ts` holds the extraction prompt and response schema |
| Skill creation | `container.skillsWriter` (`modules/skills/writer.ts`), shared with `POST /skills` so both paths write one v1 snapshot |
| Screen | `client/src/app/repos/[repoId]/conventions/` |
| Tests | `server/test/conventions-helpers.test.ts`, `server/test/conventions.it.test.ts`, `ConventionCard.test.tsx`, `helpers.test.ts` |

Two things a reader should know that the code does not say:

- **The screen has no sidebar entry.** `NAV` is vendored and off-limits
  (`client/INSIGHTS.md`, 2026-08-09), so `/repos/:repoId/conventions` is reachable
  by URL and by links from other screens, exactly like `/skills`.
- **The skill body is composed twice** — once in the modal so it can be edited
  before saving, once on the server for API callers that omit `body`. The client's
  copy is what gets saved when the modal is used; see the comment in
  `SkillFromConventionsModal/helpers.ts`.
