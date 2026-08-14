# PR Self-Review — check local changes against our own rules before the PR exists

**Status:** draft — not started
**Packages touched:** repo root (`scripts/`, `.githooks/`, `.github/`), `.claude/skills/`
**Design rationale:** [`.claude/skills/pr-self-review/PLAN.md`](../.claude/skills/pr-self-review/PLAN.md)
— that file holds the reasoning, the routing table, the severity rubric and the
ten practicality items. This spec holds **what to build and how we know it is
done**, and does not restate it.
**Depends on:** [`01-architecture-cleanup.md`](01-architecture-cleanup.md) item 9
(CI) — **shipped 2026-08-10**, four workflows exist.

---

## Problem

Changes reach a pull request having been checked against the language, and never
against **us**. The rules that actually govern this repo live in
`frontend-ui-architecture` and `onion-architecture` — where a component may sit,
which direction imports point, who owns a transaction — and nothing runs them
over a diff. They are read when an agent happens to load them, which is not a
process.

The gap is visible in what the last audit found: a transaction opened inside a
route, a repository translating no errors, thirteen navigations built as
non-links. None of that is a type error, none of it fails a test, and all of it
violates a rule we had already written down.

Three constraints shape any solution, and the first one kills the obvious design:

1. **A skill cannot block anything.** It is instructions for an agent — it
   persuades. Blocking belongs to a git hook (push) or GitHub branch protection
   (merge). See PLAN §1.
2. **Skills do not auto-invoke in headless.** A `pre-push` hook is headless, so
   a hook that relies on a skill activating itself silently checks nothing —
   worse than no hook. See PLAN §1-bis.
3. **A gate that self-skips reports success.** 12 of the server's 36 test files
   skip themselves without Docker, so `pnpm test` can exit 0 having run no
   DB-backed test at all. See PLAN §10g.

## Scope — in

| # | Deliverable | Layer |
| --- | --- | --- |
| 1 | `scripts/pr-gates.sh` — the deterministic gates, no LLM | 1 |
| 2 | `.githooks/pre-push` + `core.hooksPath` wiring | 1 |
| 3 | `.claude/skills/pr-self-review/SKILL.md` — routing, rubric, report | 2 |
| 4 | Fixture self-test for the skill | 2 |
| 5 | CI reuses `pr-gates.sh` instead of duplicating steps | 3 |

The gates live in **a script, not in the skill**, so the hook, CI and the skill
run one implementation. Three copies of the rules would drift exactly the way
the two copies of `@devdigest/shared` did.

## Scope — out

- **Rewriting code.** Report and verdict only; fixes are a separate, human-initiated step.
- **Opening the PR.** This runs *before* that, and creating the PR stays manual.
  (The moment it does gain a side effect, the skill needs `disable-model-invocation: true`.)
- **Duplicating `/code-review` and `/security-review`.** If a finding does not
  trace to a line in one of our skills or to a gate, it is not ours.
- **Judging unchanged lines.**
- **`e2e-web.yml`** — still deferred; it needs a running stack and `agent-browser`.
- **Enabling branch protection** — a GitHub repository setting, not a file. It
  cannot be done from the repo and is an owner action.

## Contract changes

**None in `@devdigest/shared`.** Nothing here crosses the server/client wire.

One internal artifact contract is introduced and must be stable, because three
consumers read it: `scripts/pr-gates.sh` emits a JSON report to stdout
(`--json`) alongside its human output. Shape, minimally:

```jsonc
{
  "gates": [{ "name": "arch", "state": "OK|FAILED|SKIPPED", "reason": "…", "cmd": "pnpm arch" }],
  "verdict": "PASS|INCONCLUSIVE|BLOCKED",
  "packages": ["server", "client"]
}
```

`state` has **three** values on purpose (PLAN §10g). A `SKIPPED` gate must not
be renderable as a pass.

## Acceptance criteria

### Phase 1 — gates script

- [ ] `scripts/pr-gates.sh` runs the six gates of PLAN §4a — typecheck, tests,
      `pnpm arch` (new violations only, never `arch:all`), `check-shared.sh`,
      migration-edit detection, secret scan — over **only the packages the diff
      touches**.
- [ ] A diff touching no package (docs only) exits 0 and reports zero gates run,
      not six passes.
- [ ] Every gate reports `OK`, `FAILED` or `SKIPPED` with a reason. Running it
      with Docker stopped yields `tests: SKIPPED — Docker unavailable, 12 files`
      and an overall `INCONCLUSIVE`, **not** `PASS`.
- [ ] Editing an existing file under `server/src/db/migrations/**` is `FAILED`;
      adding a new one is `OK`.
- [ ] Adding a line to `.dependency-cruiser-known-violations.json` without
      reducing the violation count is `FAILED` (PLAN §10f).
- [ ] `--json` output validates against the shape above.
- [ ] Wall clock ≤ 30 s on the current repo for a single-package diff.

### Phase 2 — hook

- [ ] `git config core.hooksPath .githooks` documented in `README.md`; the hook
      calls `pr-gates.sh` directly and **never** relies on a skill auto-invoking.
- [ ] `PR_SELF_REVIEW=off git push` bypasses it, prints that it was bypassed, and
      records the bypass where the PR body will pick it up.
- [ ] The hook is a no-op on a branch with no upstream diff.

### Phase 3 — skill

- [ ] `SKILL.md` carries `version: 1.0.0` and a Version history table.
- [ ] Routing follows PLAN §3, keyed on **the presence of `SKILL.md`**, so
      `react-component-quality/` (parked research, no `SKILL.md`) is never routed to.
- [ ] Each skill runs once over its subset; findings deduplicate on
      `file:line + rule`; an empty skill set is a valid result.
- [ ] Every `critical` carries a failure scenario in "input → wrong output" form,
      a fix, and a `repro:` command (PLAN §4b, §10j).
- [ ] The report opens with the verdict and closes with the signature
      `judged by: <skill>@<version> · … · gates@<sha>` (PLAN §10h).
- [ ] A clean pass still emits a PR-body draft (PLAN §10a).
- [ ] A diff touching `.claude/skills/**/SKILL.md` says so first, and warns when
      `SKILL.md` changed without a `version:` bump (PLAN §10i).
- [ ] Truncation is announced in the first line, never silent (PLAN §10e).

### Phase 4 — self-test

- [ ] Fixture diffs from PLAN §10b produce the exact expected findings; the
      suite is red if the skill returns nothing for a known-bad fixture.
- [ ] Runs in CI with everything else.

### Phase 5 — CI convergence

- [ ] The four existing workflows invoke `scripts/pr-gates.sh` rather than
      repeating `typecheck`/`test`/`arch` step by step, so the gate list has one
      definition.
- [ ] Green on a PR that changes nothing but `docs/`.

## Verdict semantics

| Verdict | When | Effect |
| --- | --- | --- |
| `PASS` | every routed gate `OK`, zero criticals | push proceeds; PR body emitted |
| `INCONCLUSIVE` | any gate `SKIPPED` | push proceeds, loudly; never reported as clean |
| `BLOCKED` | any gate `FAILED`, or ≥1 critical finding | hook refuses the push |

"Blocked from merging", as asked for, is only literally true once branch
protection marks the workflows required — see Open questions.

## Open questions

1. **Who enables branch protection, and which jobs are required?** Owner action
   on GitHub. Default proposal: `client / check`, `server-unit / typecheck`,
   `server-unit / arch`, `server-unit / test` required; `server-integration`
   advisory at first, since it is the newest and most expensive.
2. **Do warnings ever block?** Default: no, only criticals — as asked. But then a
   cap on accumulated warnings is needed, or the debt grows forever.
3. **Does the baseline reminder fire?** When a PR touches a file that already
   carries a known `arch` violation and does not fix it — silence, or a one-time
   note? Default: note, never blocking.
4. **Where does `pnpm lint` sit?** Today every rule is `warn`, so it cannot be a
   gate. Proposal: report the warning delta the diff introduces, and promote the
   check to a gate the moment the first rule becomes `error`.
5. **Suppression syntax.** PLAN §10d requires a reason on every
   `pr-review-ignore`. Do repeated suppressions of one rule open an issue
   automatically, or only surface in the report?
