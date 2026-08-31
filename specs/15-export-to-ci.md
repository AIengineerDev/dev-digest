# Export to CI v1 — run a studio-tuned agent on every PR of a GitHub repo

**Status:** draft
**Packages touched:** server, client, new `agent-runner/`
**Design source:** `design-mocks/src/20-screen_export.jsx` (N12 — the four-step
export wizard modal); the CI tab it opens from is the `tab: "CI"` variant of
`ScreenAgents` referenced at `design-mocks/src/20-screen_export.jsx:120`.
**Supersedes:** nothing. A fuller earlier draft of this file was deliberately
removed; this is a smaller, coherent slice, not a trim of that one.
**Borders on:** `specs/14-multi-agent-review.md` — worktree A. That spec owns
`server/src/modules/reviews/**`, the multi-agent client routes,
`client/messages/en/runs.json` and `RunReviewDropdown`. The line is drawn in
[Ownership](#ownership--worktree-b): v1 shares **no file** with it.

---

## Problem

An agent is authored in the studio — model, system prompt, linked skills, gate
policy — and then it only ever runs when a human clicks `Run review` on a PR
page. There is no way to make the tuned agent the thing that reviews *every*
pull request of a repository, and no way to make it block a merge.

Everything the gate needs is already shipped and unreachable:

| Already exists | Where | State |
| --- | --- | --- |
| `CiTarget`, `CiFile`, `AgentManifest`, `CiExportInput`, `CiInstallation`, `CiExport` | `server/src/vendor/shared/contracts/eval-ci.ts:284`, `:288`, `:303`, `:325`, `:339`, `:349` | written, **imported by nobody** |
| `ci_installations {id, agent_id, repo, target_type, installed_at}` | `server/src/db/schema/ci.ts:4` | table exists, never written |
| `agents.ci_fail_on` | `server/src/db/schema/agents.ts:25` | shipped, drives local runs only |
| `countBlockers(findings, ciFailOn)` — the whole gate decision | `server/src/modules/reviews/run-executor.ts:359` | shipped |
| `commitFiles` (branch from base, tree layered on base tree) and `openPullRequest` | `server/src/adapters/github/octokit.ts:263`, `:245`; port at `server/src/vendor/shared/adapters.ts:161` | shipped |
| Provider → secret-name map | `server/src/modules/settings/constants.ts:9-11` | shipped |
| Complete wizard + CI-tab string set | `client/messages/en/ci.json` (`exportWizard.*`, `ciTab.*`) | present, unconsumed |
| `ExportWizardSteps` | `client/src/vendor/ui/ExportWizardSteps.tsx` | vendored, unused |
| `reviewer-core` designed for two consumers, one of which does not exist | `reviewer-core/package.json` description names `agent-runner (CI)`; `reviewer-core/src/index.ts:9-11` | engine shipped, runner missing |

There is no `server/src/modules/ci/`, no export route, no CI tab, and no
`agent-runner` package.

### Why v1 reports nothing back to the studio

The studio is a localhost app. `server/src/server.ts:29` binds `0.0.0.0` on a
developer machine, and `LocalNoAuthProvider`
(`server/src/adapters/auth/local.ts:14`) means there is no login anywhere in the
API. In the default setup **GitHub Actions cannot reach the studio at all**. An
ingest path would first need tunnelling or a hosted studio — an unsolved
topology question standing behind a feature nobody has asked for yet.

So the product story is: **the studio is where an agent is authored; GitHub is
where its CI results live.** The Actions job and the posted review *are* the
history. v1 needs zero connectivity between CI and the studio, which is exactly
what makes it shippable — and what makes the "what do users want back" question
answerable from real usage instead of guessed at now.

---

## Scope — in / out

**In**

- The four-step wizard (Target → Preview → Configure → Install), opened by
  `Add to CI` on the agent editor's `CI` tab.
- One server generation route producing a `CiFile[]`:
  `.devdigest/agents/<slug>.yaml`, one `.devdigest/skills/<slug>.md` per linked
  skill, and `.github/workflows/devdigest-review.yml`.
- Install: commit to a new `devdigest/ci` branch and open a PR.
- `agent-runner/` — a new npm package that runs inside the Action.
- A minimal `CI` tab: `Add to CI`, the installations list, and `Fail CI on`.

**Out** — each with the reason it is out:

| Out of v1 | Reason |
| --- | --- |
| Any ingest endpoint (`POST /ci/runs`) | CI cannot reach a localhost studio; see above |
| `run_token`, token hashing, revocation | Only an ingest path needs auth; v1 adds no auth surface at all |
| Writing `ci_runs` rows, or `agent_runs` with `source='ci'` | Nothing produces them without ingest; both stay as they are, unused |
| The `CI Runs` page, and therefore **any change to `client/src/vendor/ui/nav.ts`** | No screen, so no sidebar item — `nav.ts:35` already states entries are added only when the route exists |
| Any change to `@devdigest/shared` | Nothing consumes an artifact in v1, so `CiResultArtifact` is not extended |
| **Any database migration** | One `ci_installations` row fits the table exactly as it is (`schema/ci.ts:4`). This is R8, not an accident |
| A preflight that the stored `GITHUB_TOKEN` has write scope | A missing permission surfaces at Install as GitHub's own error — a truthful message the user can act on |
| `Copy files as a zip` (mock `20-screen_export.jsx:112`) | The PR is the path; a fallback for a path nobody has walked is speculative |
| `post_as: 'pr_comment'` | The gate is the exit code either way. The contract keeps three values; v1 rejects the third (R14) rather than changing the contract |
| CircleCI, Jenkins, Generic CLI | GitHub Actions only; the other three render `coming soon` and unselectable (R2) |
| `.devdigest/memory.jsonl` (mock `:15`) | See Q1 — omitted, because omission is the recoverable mistake |
| A published marketplace action, a GitHub App, automated branch protection | Each is its own project; none is needed to block a merge (R6) |

---

## Requirements

| ID | Requirement | Source |
| --- | --- | --- |
| R1 | The agent editor gains a `CI` tab. It shows `Add to CI`, the `ci_installations` rows for this agent (repo + installed date), and the `Fail CI on` setting bound to `agents.ci_fail_on`. No job statuses, no history table. | mock `20-screen_export.jsx:120`; strings `ci.json` `ciTab.*`; tab key already reserved at `client/messages/en/agents.json:52` and absent from `AgentEditor/constants.ts:11-16` |
| R2 | `Add to CI` opens a modal wizard with the four steps `Target · Preview · Configure · Install`. On Target, `GitHub Actions` is selected and carries `recommended`; CircleCI, Jenkins and Generic CLI render disabled with `coming soon` and cannot be chosen. | mock `:3-8`, `:47-58`; `ci.json` `exportWizard.steps.*`, `exportWizard.targets.*` |
| R3 | Preview and Install render and commit **the bytes of one generation call**. The wizard generates once, holds the `CiFile[]`, previews it, and sends nothing back that could be regenerated — the user must not be able to read one workflow and run another. | mock `:59-70` (preview pane); safety |
| R4 | Generation produces exactly: `.devdigest/agents/<slug>.yaml` (an `AgentManifest`), one `.devdigest/skills/<slug>.md` per skill linked in `agent_skills` (`schema/agents.ts:51`), and `.github/workflows/devdigest-review.yml`. An agent with zero linked skills produces the manifest and the workflow only, with `skills: []`. | mock `:10-16`; `AgentManifest.skills` at `contracts/eval-ci.ts:296-301` |
| R5 | The generated workflow: triggers on `pull_request` with the selected types; declares `permissions:` explicitly and minimally (`contents: read`, `pull-requests: write`, everything else `none`); pins every third-party `uses:` to a full commit SHA, never a tag; and passes the provider's API-key secret named from the provider→key map (`settings/constants.ts:9-11`) — `OPENROUTER_API_KEY` for the default provider, not the mock's `OPENAI_API_KEY`. It never uses `pull_request_target`. | mock `:19-33` (and its divergences, below); `AgentManifest.provider` defaults `openrouter` at `contracts/eval-ci.ts:305` |
| R6 | The Configure step shows: trigger chips, `Post results as` with `GitHub review` and `None (exit code only)` only, and a **read-only secret status list** — the name of each expected secret and whether the studio holds a value for it. The wizard never displays, transports or receives a secret value; it links the user to the repo's Settings → Secrets and variables → Actions. The mock's disabled `Block merge on findings` toggle is replaced by an info block naming the three real steps: `ci_fail_on` → non-zero exit → mark the check required in branch protection. | mock `:83-92` (secrets), `:99-103` (dead toggle); `ci.json` `exportWizard.secretNote`, `blockMerge*`; secrets at `server/src/platform/config.ts:89` |
| R7 | Install commits the generated files to a branch named `devdigest/ci` created from `CiExportInput.base` and opens a PR titled `Add DevDigest CI review`. Writing to the default branch is never offered. Install persists **one** `ci_installations` row per `(agent_id, repo)`; a re-export updates that branch, that PR and that row rather than creating a second. | mock `:105-111`; `octokit.ts:263` layers onto the base tree so unrelated files survive; `contracts/eval-ci.ts:332` (`base` default `main`) |
| R8 | v1 adds **no** database migration, **no** `@devdigest/shared` contract change, and **no** `client/src/vendor/ui/nav.ts` change. `ci_installations` is used exactly as it exists today. | `schema/ci.ts:4` already has every column needed; `nav.ts:35` |
| R9 | `agent-runner/` is a new package that, inside the Action: reads and Zod-validates `.devdigest/agents/<slug>.yaml` against `AgentManifest`; **computes the diff from its own checkout**; loads the referenced skill files; calls `reviewPullRequest` (`reviewer-core/src/review/run.ts:131`) with the grounding gate; posts the result per `post_as`; and exits `countBlockers(findings, ci_fail_on) > 0 ? 1 : 0`. It performs no artifact upload, no HTTP call to the studio and no telemetry. | `reviewer-core/package.json` description; `run-executor.ts:359` |
| R10 | The runner computes the diff itself from the checked-out refs and never trusts a server-persisted diff. A review triggered without a page visit runs against whatever the last visit persisted (`server/INSIGHTS.md:276-286`), so a CI reviewer that reuses studio state reviews the wrong code. | `server/INSIGHTS.md:276-286`; `diff-loader.ts` caveats at `server/INSIGHTS.md:288-294` |
| R11 | On a pull request from a fork, the runner **skips** and says why: secrets are unavailable and `GITHUB_TOKEN` is read-only in that context. `pull_request_target` with a checkout of PR code is never generated as a workaround. | GitHub Actions fork-PR semantics; R5 |
| R12 | Everything originating in the PR — diff hunks, branch names, PR title and body, comments — is untrusted. It is never interpolated into a shell command in the workflow, and it reaches the model wrapped as untrusted, the same way non-first-party skill bodies already are (`server/src/modules/skills/assembler.ts:181-184`, `wrapUntrusted` exported at `reviewer-core/src/index.ts:15-19`). | `server/INSIGHTS.md` prompt-injection entries; `assembler.ts:181` |
| R13 | `agent-runner/` uses **npm** with its own lockfile (like `mcp/` and `e2e/`) and **bundles** for the Action rather than emitting a `tsc` `dist/`. A package that path-aliases into `server/src/vendor/shared` cannot emit — tsc pulls those sources into its program and writes them under its own `dist/`. | `CLAUDE.md` "Conventions"; `reviewer-core/src/index.ts:9-11` names the ncc bundle path |
| R14 | `post_as: 'pr_comment'` is accepted by the contract and rejected by v1 with a message naming the two supported values. The contract's three values (`contracts/eval-ci.ts:330`) are not changed. | R8; scope |
| R15 | The agent delete confirmation states that deleting the agent removes its CI installation records while the committed workflow keeps running in the target repo, and that removal requires deleting the workflow file there. | `schema/ci.ts:7` — `agent_id` is `on delete cascade` |

---

## Decisions — do not re-open these

1. **Studio authors, GitHub hosts the result.** No studio round-trip in v1.
2. **Additive-only in files v1 owns.** No migration, no contract change, no nav
   change (R8).
3. **The manifest is the contract**, validated by the same Zod `AgentManifest`
   schema in the studio and the runner — one schema, so the two ends cannot
   drift.
4. **`OPENROUTER_API_KEY`, not `OPENAI_API_KEY`.** The mock predates the BYO-key
   work; `openrouter` is a first-class provider (`schema/agents.ts:15`) and is
   the manifest default. The manifest's provider decides the key name via
   `settings/constants.ts:9-11`.
5. **Secret status only, never a value.** The user adds it in the repo's
   Settings → Secrets and variables → Actions.
6. **Blocking a merge is `ci_fail_on` → non-zero exit → required status check.**
   The mock's "Requires a GitHub App" is false here.
7. **`pull_request_target` with a PR checkout is never used.** Fork PRs skip.
8. **`permissions:` is declared explicitly and minimally.**
9. **Every third-party `uses:` is pinned to a full commit SHA.**
   `uses: devdigest/review-action@v1` (mock `:29`) stays a commented placeholder
   — no such action is published, and a workflow referencing one fails on its
   first run.
10. **PR-originated text is untrusted** (R12).
11. **`agent-runner/` is npm + bundled, never `tsc`-emitted** (R13).

---

## Design analysis

### States the design covers

`20-screen_export.jsx` draws, all happy-path: the four target cards with GitHub
Actions selected (`:47-58`); the preview split-pane with a five-file tree and a
YAML pane badged `editable` (`:59-70`); Configure with trigger chips, a
two-row secret table showing `not set` / `ready`, three `Post results as`
radios, and a disabled `Block merge` toggle (`:71-93`); and Install with two
action cards plus a docs link (`:104-114`). Step navigation is local state
(`:44`) and `Install` has no handler (`:122`).

### States it does not

| Axis | Gap in the mock | Requirement |
| --- | --- | --- |
| Emptiness | An agent with **zero linked skills** — the tree hardcodes two skill files (`:12-13`), so the empty tree is undrawn | R4 |
| Cardinality | One installation vs many on the CI tab; a repo with a long owner/name; twenty linked skills overflowing the 260px file tree (`:60`) | R1, R4 |
| Extremes | A system prompt of tens of KB inside a YAML scalar; a skill slug that is not a safe path segment | R4, C7 |
| Time | `Generating…` while the files are produced (`ci.json` has the string, the mock has no state for it); Install in flight; the GitHub call hanging | R3, R7 |
| Failure | Repo not found, no write permission, base branch missing, `devdigest/ci` already exists, PR already open — the mock draws none | R7, C1, C2, C5 |
| Permission | The stored `GITHUB_TOKEN` cannot write to the target repo. v1 deliberately does not preflight; the error is GitHub's own at Install | R7 (out-of-scope note) |
| Concurrency | The agent is edited, or deleted, after export while the committed workflow keeps running | R15, Q2, C3 |
| Reachability | The mock is a modal over the CI tab (`:118-120`); nothing says how the tab is reached, what closing mid-wizard does, or where the user lands after Install | R1, R2, C6 |

### Divergence from `client/` today

| Mockup | Today (`path:line`) | Intended change (→ Rn) or mockup oversight (→ Qn) |
| --- | --- | --- |
| Agent editor has a `CI` tab | `AgentEditor/constants.ts:11-16` ships `config · skills · context · evals`; the label key `editor.tabs.ci` exists at `client/messages/en/agents.json:52` | Intended → **R1** |
| Wizard exists | No wizard component; `client/src/vendor/ui/ExportWizardSteps.tsx` is vendored and imported nowhere | Intended → **R2** |
| Four selectable CI targets (`:3-8`) | Nothing implemented; `CiTarget` has all four (`contracts/eval-ci.ts:284`) | Intended, narrowed → **R2** (gha only; three disabled) |
| `openai-key: ${{ secrets.OPENAI_API_KEY }}` (`:30`) | Provider→key map is `openai/anthropic/openrouter` (`settings/constants.ts:9-11`); manifest defaults to `openrouter` (`contracts/eval-ci.ts:305`) | **Mockup oversight** — it predates BYO-key → **R5**, Decision 4 |
| `uses: devdigest/review-action@v1` (`:29`) | No such action is published anywhere in this repo or on the marketplace | **Mockup oversight** — a workflow shipping this fails on run 1 → **R5**, Decision 9 |
| `uses: actions/checkout@v4` (`:28`) — a floating tag | — | Intended change → **R5** (full commit SHA) |
| No `permissions:` block (`:19-33`) | — | Intended change → **R5** |
| `.devdigest/memory.jsonl` in the tree (`:15`) | `memory` table at `server/src/db/schema/knowledge.ts:8` | Deferred → **Q1** |
| `Block merge on findings` — toggle disabled, "Requires a GitHub App" (`:89-93`) | `agents.ci_fail_on` (`schema/agents.ts:25`) + `countBlockers` (`run-executor.ts:359`) already decide this deterministically, with a PAT, today | **Mockup oversight, and the consequential one** — a control that cannot be switched on teaches the user the feature is unavailable when it is available → **R6** |
| `Copy files as a zip` (`:112`) | — | Out of scope; the card is not built |
| Preview pane badged `editable` (`:67`) | `CiFile.editable` defaults `true` (`contracts/eval-ci.ts:291`) | **Q3** — v1 previews read-only unless answered otherwise |

### UX improvements proposed

- `proposed` — Show the resolved secret **name** per provider rather than a
  fixed `OPENAI_API_KEY` row. Reason: the user copies the exact name into GitHub;
  a wrong name is a failure that only surfaces on the first PR, minutes later.
- `proposed` — After Install, show the PR URL as the primary action rather than
  a `Published` confirmation alone (`ci.json` already has `publishDialog.openPr`).
  Reason: the next necessary step is reviewing and merging that PR; anything else
  is a dead end the user has to navigate out of.
- `proposed` — On the Install step, restate the three required-check steps from
  R6 rather than only on Configure. Reason: it is the step where the user leaves
  for GitHub, and it is the point at which "why did my merge not get blocked"
  is decided.

---

## Module interaction

| From → to | Contract | Sync? | If the far side fails | Requirement |
| --- | --- | --- | --- | --- |
| client wizard → server generation route | `CiExportInput` → `CiFile[]` (`contracts/eval-ci.ts:325`, `:288`) | yes | Wizard stays on Preview with the error and a `Retry`; no installation row is written | R3 |
| client wizard → server install route | `CiExportInput` → `CiExport` (`:349`) | yes | Error surfaced verbatim from GitHub; no row written; the user may retry | R7 |
| server CI service → GitHub | `GitHubClient.commitFiles` / `openPullRequest` (`vendor/shared/adapters.ts:161`, `octokit.ts:245`) — through the port, never Octokit directly | yes | Adapter's existing retry/timeout applies; on exhaustion Install fails atomically-from-the-user's-view: no row, and any created branch is left for the user to see | R7 |
| GitHub Actions runner → GitHub API | `GITHUB_TOKEN` from the job, `pull-requests: write` | yes | Findings computed but unpostable → the job still exits on the gate; the log carries the findings | R9 |
| agent-runner → LLM provider | provider key from repo secrets | yes | Job fails with the provider error; **not** a silent pass — a review that did not happen must never look like a clean review | R9, C8 |
| agent-runner → studio | **none in v1** | — | n/a — this row exists to state the absence | Scope |

---

## Contract changes

**None.** `CiTarget`, `CiFile`, `AgentManifest`, `CiExportInput`,
`CiInstallation` and `CiExport` are used exactly as written at
`server/src/vendor/shared/contracts/eval-ci.ts:284-357`. `CiResultArtifact` and
`CiRun` are untouched because nothing consumes them (R8).

---

## Corner cases

| ID | Case | Expected behaviour | Requirement |
| --- | --- | --- | --- |
| C1 | Re-export to a repo that already has an installation for this agent | `commitFiles` finds the existing `devdigest/ci` ref and commits onto it (`octokit.ts:270-274`); the open PR is reused, not duplicated; the existing `ci_installations` row's `installed_at` is refreshed — one row, not two | R7 |
| C2 | The previous export PR was closed unmerged, and `devdigest/ci` still exists | Files are committed to the existing branch and a **new** PR is opened from it; if GitHub refuses because a PR already exists for that head, the existing PR URL is returned instead of erroring | R7 |
| C3 | The agent is deleted in the studio while the committed workflow keeps running and keeps billing the user's key | `ci_installations.agent_id` is `on delete cascade` (`schema/ci.ts:7`), so the row disappears silently. The delete confirmation must say: the workflow in `<repo>` continues to run and charge your key until you delete `.github/workflows/devdigest-review.yml` there | R15 |
| C4 | The manifest is hand-edited in the repo into an invalid shape | Zod validation fails; the runner exits **non-zero** with the Zod path and message, and posts nothing. An unparseable config is a red check, never a silent pass | R9 |
| C5 | The repo's default branch is not `main` | `CiExportInput.base` defaults to `main` (`contracts/eval-ci.ts:332`) but is settable; the wizard prefills the target repo's actual default branch. A base that does not exist fails at `getRef` with "base branch `<name>` not found" | R7 |
| C6 | The user closes the wizard between Preview and Install | Nothing is committed, no row is written; reopening starts at Target with the same repo prefilled | R2, R3 |
| C7 | A skill slug is not a safe path segment (`../`, a leading `/`, an empty string) | Generation rejects the export naming the offending skill, rather than emitting a `CiFile.path` that escapes `.devdigest/skills/` | R4 |
| C8 | The provider key secret is missing in the target repo | The job fails with "OPENROUTER_API_KEY is not configured" (the existing shape from `server/src/modules/_shared/provider-errors.ts:5`) and exits non-zero. It is never reported as "no findings" | R9 |
| C9 | The diff is empty — the PR touches only files the runner cannot diff | The runner exits `0`, posts nothing, and logs "no reviewable diff"; it does **not** report a clean review | R10 |
| C10 | Fork PR | Skipped with the reason printed, exit `0` — a fork PR must not show as a failing required check the author cannot fix | R11 |
| C11 | A PR branch named `$(rm -rf /)` or a diff hunk containing `${{ }}` | Neither reaches a shell command or a workflow expression; both reach the model inside `<untrusted>` | R12 |

---

## Design conformance

Built by reading `design-mocks/src/20-screen_export.jsx` and
`17-screen_agents.jsx` directly — inline `React.createElement` values, so every
number is copied rather than estimated.

**The page frame.** The wizard is a `Modal`, which centres itself at
`width: 720` — the frame question does not arise for it. The **CI tab body**,
which is not a modal, sits inside the agent editor's existing layout and adds no
page padding of its own; it inherits whatever the editor already applies, and
must not introduce a second `maxWidth`. If a new full-page CI screen ever
appears it uses `padding: "24px 32px 44px", maxWidth: 1200, margin: "0 auto"`
— `PageContainer`'s values (`client/src/components/page-shell/styles.ts:5`),
not the mocks' `28px`, which is a fixed-width-frame artefact with no centering
story. See the same note in `specs/14-multi-agent-review.md`.

| Element | Source | What to match |
| --- | --- | --- |
| Modal | `20:110-113` | `Modal` at `width: 720`, title `Export to CI`, subtitle naming the agent; the step bar sits in its own band, `padding: 18px 20px` with a bottom border, and the body below at `padding: 20` |
| Step bar | `20:112` | the vendored `ExportWizardSteps` with labels `Target · Preview · Configure · Install` — imported, never modified (`client/src/vendor/ui/**` is do-not-touch) |
| Target cards | `20:52-60` | a 2-column grid, gap 12; card `padding: 16`, radius 10, `--bg-surface`, **1.5px** border that turns `--accent` when selected; 34×34 icon tile on `--bg-elevated`; name 14/600; `recommended` badge pushed right; 12px muted description at `marginTop: 8` |
| Preview | `20:62-70` | a two-pane box, `gridTemplateColumns: 260px 1fr`, `height: 340`, 1px border, radius 9, `overflow: hidden`; left pane on `--bg-surface` with a 10.5px/700 uppercase `FILES TO CREATE` label and mono rows that highlight on `--accent-bg`; right pane header 8px/12px with the mono path and an `editable` badge, then a `--code-bg` `<pre>` at 11.5px, `lineHeight: 1.6` |
| Configure | `20:72-93` | `FormField` per group; triggers as `Chip`s with a `Check` icon when on; the secrets list as a bordered box with 160px mono key column, muted description, and a dot `Badge` — `--ok`/`--ok-bg` for ready, `--warn`/`--warn-bg` for not set; `Post results as` as custom 16px radio circles that fill `--accent` |
| Install | `20:95-104` | primary card full-width, `padding: 18`, radius 10, **1.5px `--accent` border on `--accent-bg`**, with a `GitPullRequest` icon, 14/700 heading and a `recommended` badge; the secondary option below it at `padding: 16` with a plain `--border-strong` border; a centred 11.5px muted help line at `marginTop: 14` |
| Footer | `20:106-109` | `Back` as `kind="ghost"` with a `ChevronLeft`, pushed left; `Continue` as `kind="primary"` with `iconRight="ArrowRight"`, or `Install` with `icon="Check"` on the last step |
| CI tab | `17` (the `CI` tab of the agent editor) | the tab strip gains a fifth entry; the body is the installations list plus the actions R1 names |

**Divergences — reduced to one, because the design was refreshed.** The mock
copy these were written against was stale. `design-mocks/` was refreshed from
`Dev Digest W8.zip` on 2026-08-28, and the current `20-screen_export.jsx`
**already carries two of the three fixes this spec claimed as its own**:

1. The workflow references `OPENROUTER_API_KEY` (`:34`), not `OPENAI_API_KEY`.
2. The dead `Block merge` toggle is gone, replaced by the info block this spec
   specified almost word for word (`:87`): *"To block merges: set **Fail CI on**
   (CI tab) so the run exits non-zero, then add a **required status check** in
   the repo's GitHub branch protection. No GitHub App needed."*
3. `uses: devdigest/review-action@v1` is gone. The run step is now
   `node .devdigest/runner.mjs review --agent <slug> --pr <n> --fail-on critical`,
   with `actions/checkout@v4` and `actions/setup-node@v4` before it.

So there is **no divergence left to justify** on these three: build what the mock
now shows. What remains are the two that follow from v1's scope — the three
non-GitHub target cards render `coming soon` and are unselectable, and `Copy
files as a zip` is not built, so the Install card stands alone rather than as the
first of two.

**One thing the refreshed mock changes materially:** the runner is invoked as a
**file committed into the user's repository** (`.devdigest/runner.mjs`), not
fetched from npm. This spec follows the design. An earlier revision had switched
to `npx @devdigest/agent-runner@<version>`, which would have left every generated
workflow red until somebody published that package — a release step no phase
owned. The committed runner works on the first PR, which is the whole point of
the export.

Note also that the design pins only `actions/checkout@v4` and
`actions/setup-node@v4` by **tag**, not SHA. This spec keeps the SHA-pinning
requirement (R5): a tag is mutable, and the mock is a picture of a workflow, not
a security review of one.

---

## Non-functional requirements

| Axis | Bound | Requirement | `n/a` because |
| --- | --- | --- | --- |
| Latency | Preview renders generated files within 2 s for an agent with ≤ 20 skills; beyond that the `exportWizard.generating` state is shown, never a blank pane | R3 | |
| Scale | The generated bundle stays under GitHub's Contents-API practical limit — a single file over 1 MB (a very large system prompt or skill body) fails generation with a named file, rather than failing at `createTree` with an opaque error | R4 | |
| Cost | v1 adds **zero** LLM calls to the studio. Every model call it causes runs on the user's key inside their Actions job — one review per PR event, priced by their provider. The workflow is generated with the manifest's `strategy` so a map-reduce agent does not silently multiply that | R5, R9 | |
| Failure | Generation and Install fail hard with the upstream message; the runner degrades only where a degraded result is honest (C9, C10) and fails hard everywhere else (C4, C8) | R7, R9 | |
| Security | Untrusted: diff, branch names, PR title/body, comments (R12). A secret value never enters the wizard, a request body, a log line, or the generated files — only its **name** and a boolean status (R6). The generated files land in the user's repository, so they must contain nothing workspace-private beyond the agent config the user chose to export (Q1) | R6, R12 | |
| Accessibility | The wizard is keyboard-reachable end to end: focus moves into the modal on open, `Back`/`Continue`/`Install` are in tab order, `Escape` closes it, and focus returns to `Add to CI`. Disabled targets are focusable-but-announced-disabled, not skipped silently | R2 | |
| i18n | Every new string resolves from the existing `ci` namespace (`client/messages/en/ci.json`). No new namespace, and no hardcoded user-facing string — a hardcoded string is a defect here. Keys the mock needs but `ci.json` lacks (the `coming soon` badge, the required-check info block, the delete-cascade warning) are **added to `ci.json`** | R1, R2, R6, R15 | |
| Observability | The Actions job log is the only record in v1: it must carry the manifest name and model, the file count and line count reviewed, the grounding-gate summary (`groundingSummary`, `reviewer-core/src/index.ts:23`), the blocker count, and the exit code — enough to explain a red check without re-running it | R9 | |

---

## Acceptance criteria

| ID | Criterion — checkable from outside | Requirement | Verify by |
| --- | --- | --- | --- |
| A1 | Opening an agent at `/agents/<id>?tab=ci` shows the CI tab with `Add to CI`, the installations list (or `ciTab.empty`), and a `Fail CI on` control whose change persists to `agents.ci_fail_on` | R1 | client test · manual click |
| A2 | The wizard opens on `Target` with GitHub Actions selected; clicking the CircleCI, Jenkins or Generic CLI card does not change the selection and each shows `coming soon` | R2 | client test |
| A3 | The `CiFile[]` rendered on Preview is byte-identical to the `files` array returned by the Install response for the same wizard session | R3 | server `*.it.test.ts` · client test |
| A4 | Generating for an agent with two linked skills returns exactly four paths; for an agent with zero linked skills, exactly two, and the manifest's `skills` is `[]` | R4 | server hermetic test |
| A5 | The generated `devdigest-review.yml` parses as YAML and contains a top-level `permissions:` with `contents: read` and `pull-requests: write`; every `uses:` value matches `@[0-9a-f]{40}` or is a comment; the file contains no `pull_request_target` and no uncommented `devdigest/review-action` | R5 | server hermetic test (assert on the generated string) |
| A6 | Configure offers exactly two `Post results as` options; the secrets list shows `OPENROUTER_API_KEY` for an `openrouter` agent and `ANTHROPIC_API_KEY` for an `anthropic` one, with a status badge and no value field; the response body for the generation call contains no secret value | R5, R6 | client test · server hermetic test |
| A7 | Install against a fake GitHub adapter commits to branch `devdigest/ci` with `base` as parent, opens a PR titled `Add DevDigest CI review`, returns its URL, and writes one `ci_installations` row. Running Install a second time for the same `(agent, repo)` leaves the row count at one | R7 | server `*.it.test.ts` (uses the existing mock adapter at `server/src/adapters/mocks.ts:223`) |
| A8 | `git diff --stat main...HEAD` for this branch touches no file under `server/src/db/migrations/`, none under `server/src/vendor/shared/`, and not `client/src/vendor/ui/nav.ts` | R8 | manual command |
| A9 | Running `agent-runner` against a fixture checkout with a stubbed LLM posts a review and exits `1` when a `critical` finding is present and `ci_fail_on: critical`, and `0` when the only finding is `info` | R9 | `agent-runner` test |
| A10 | The runner's diff for the fixture matches `git diff <base>...<head>` computed in the same checkout, and the runner makes no HTTP request to `localhost:3001` (asserted by a network stub that fails the test on any such call) | R9, R10 | `agent-runner` test |
| A11 | With the event payload marked as a fork PR, the runner exits `0`, posts nothing, and prints a reason naming secret unavailability | R11 | `agent-runner` test |
| A12 | A fixture PR whose branch name and diff contain `$(id)`, backticks and `${{ github.token }}` produces a generated workflow with no interpolation of those values, and a prompt in which they appear inside the untrusted wrapper | R12 | `agent-runner` test · server hermetic test |
| A13 | `cd agent-runner && npm ci && npm test` passes; the package has a `package-lock.json` and no `pnpm-lock.yaml`, and its build emits a bundle with no `dist/**/vendor/shared/**` inside it | R13 | manual command |
| A14 | Posting an export with `post_as: 'pr_comment'` returns a 4xx naming `github_review` and `none`, and `contracts/eval-ci.ts:330` still lists three values | R14 | server hermetic test |
| A15 | The delete-agent confirmation for an agent with an installation names the repo and states the workflow keeps running until its file is deleted there | R15 | client test |

---

## Traps

- **`ci_installations` deletes silently.** `agent_id` is `on delete cascade`
  (`schema/ci.ts:7`). Deleting an agent erases the studio's only record of an
  export while the workflow in someone's repository keeps running on their key.
  R15 exists solely because of this line.
- **`commitFiles` is not a force-push.** It layers onto the parent's tree
  (`octokit.ts:263-296`), so a stale `devdigest/ci` branch from a previous
  export accumulates rather than resets. C1 and C2 are about that behaviour, not
  about new code.
- **The mock's workflow does not work.** `devdigest/review-action@v1` does not
  exist and `OPENAI_API_KEY` is the wrong key for the default provider. Copying
  the YAML at `20-screen_export.jsx:19-33` produces a workflow that fails on its
  first PR.
- **A CI review must never reuse studio-persisted diff state.** `pr_files` is
  refreshed as a side effect of `GET /pulls/:id` (`server/INSIGHTS.md:276-286`),
  so a runner that asked the studio would review whatever a human last looked at.
  R10 is the requirement; A10 is the test that keeps it true.
- **`pnpm arch` is baselined at 11 known violations** and must never be
  regenerated; **`client pnpm lint` exits 0 with 43 pre-existing warnings** and
  must not be `--fix`ed as part of this feature. Server layering is
  routes → service → repository, and GitHub goes through
  `GitHubClient` (`vendor/shared/adapters.ts:143`), never Octokit directly.
- **Test lanes split by filename.** Anything touching Postgres is
  `*.it.test.ts`; generation tests are pure string assertions and must stay
  hermetic.

---

## Ownership — worktree B

**Owned here:** `agent-runner/**`, `server/src/modules/ci/**`, the agent
editor's CI tab (`client/src/app/agents/[id]/_components/AgentEditor/**`),
`client/messages/en/ci.json`.

**Must not touch:** `server/src/modules/reviews/**`, the multi-agent client
routes, `client/messages/en/runs.json`, `RunReviewDropdown`, and — new in v1 —
`client/src/vendor/ui/nav.ts` and `server/src/db/migrations/**`.

**Consequence, and it is a real benefit of the simplification.** With no
migration (R8) and no nav change, worktree B **shares no file with worktree A**.
The merge order the fuller design forced — A first, because both branches would
generate `0018_*` and collide inside `meta/_journal.json`, which may never be
hand-edited — is no longer required. The two features are independently
mergeable in either order.

`specs/14-multi-agent-review.md:339-380` still describes that ordering, and
`:365-370` still instructs B to regenerate its migration. That is now **A's
constraint alone**, not a joint one: B generates no migration to regenerate.
Spec 14 is not edited to say so — a spec is a record — so this paragraph is the
correction.

---

## Open questions

| ID | Question | My proposed default | Blocks |
| --- | --- | --- | --- |
| Q1 | The mock lists `.devdigest/memory.jsonl` (`20-screen_export.jsx:15`). It is a dump of the `memory` table (`server/src/db/schema/knowledge.ts:8`) into somebody else's repository, and it may hold working notes from unrelated PRs. Should CI runs get memory at all? | **Omit it in v1** — the only choice where a mistake is recoverable; publishing private notes into a third-party repo is not. To include it later, three things must be true: memory rows carry a per-repo scope so only that repo's notes are exportable; the wizard previews the exact rows before commit; and the export is opt-in per installation | R4 · nothing |
| Q2 | The agent is edited in the studio after export. v1 does nothing — the committed manifest keeps running, so the repository is the source of truth for CI. Should a later version show `config drifted — re-export` on the CI tab? | **Do nothing in v1.** Detecting drift needs a manifest hash stored per installation, which is a column, which is a migration (R8) | R1 · nothing |
| Q3 | `CiFile.editable` defaults `true` (`contracts/eval-ci.ts:291`) and the mock badges the preview `editable` (`:67`). Is the preview editable in v1? | **Read-only.** An editable preview means the bytes Install commits are no longer the bytes generation produced, which is the invariant R3 exists to protect. The user edits the files in the export PR, where the change is reviewable | R3 · nothing |
| Q4 | What the first real users want back in the studio — job status, findings, cost, or nothing — is precisely what this v1 exists to find out. Ingest is **deferred, not rejected**: the shape of the ingest contract should be decided by what people ask for after using this, not before | **Ship v1 with no ingest and revisit after the first external installations** | Scope · nothing |

---

## Could not establish

- **Whether `commitFiles` succeeds when `devdigest/ci` exists but has diverged
  from `base`.** The code path is read (`octokit.ts:270-274` prefers the
  existing ref as parent), but the GitHub behaviour on a badly diverged branch is
  not reproducible without a real repository and a token. C1 and C2 state the
  intent; the implementer should confirm against a scratch repo.
- **GitHub's exact error when opening a PR whose head already has an open PR.**
  C2 specifies returning the existing URL; the discriminating field of that error
  response was not verified here.
- **The practical file-size ceiling of `git.createTree` with inline `content`.**
  The 1 MB bound in the non-functional table is taken from GitHub's documented
  Contents-API guidance, not measured against this adapter.
- **Whether `client/messages/en/ci.json` covers every string R2/R6/R15 need.**
  The file was read in full and the `coming soon` badge, the required-check info
  block and the delete-cascade warning are absent — those are additions, but the
  full diff was not enumerated key by key.
- **Nothing about `agent-runner` could be checked against existing code**, since
  the package does not exist and there is no lab branch on `origin` carrying one.
  R9, R10, R11 and R13 are specified from the `reviewer-core` public API
  (`reviewer-core/src/index.ts`) and the repo's packaging conventions, not from a
  working runner.
