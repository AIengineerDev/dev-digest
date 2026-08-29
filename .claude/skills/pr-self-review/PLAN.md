# `pr-self-review` — the plan for the skill

Status: **plan**. The skill itself is not written and nothing here runs.

Goal: before opening a PR, check every local change against this repository's own
skills, routing the files in the diff to the matching rules, and **block**
progress if a single critical finding exists.

---

## 1. The one constraint that determines the whole design

**A skill cannot forbid anything.** A skill is instructions for an agent: it
persuades, it does not stop. Only something that runs outside the conversation
can block a merge:

| What we want to forbid | Who can actually do it | Do we have it today |
| --- | --- | --- |
| Creating a commit | `pre-commit` git hook | no |
| Pushing a branch | `pre-push` git hook | no |
| Merging a PR | GitHub branch protection + a required check | **half** — checks exist, protection does not |

Measured 2026-08-09: the repository had no `.github/` at all, while
[`TESTING.md`](../../../TESTING.md) described five workflows as existing — the
documentation described CI that did not exist. The remote was real.

**Updated 2026-08-10.** The §8.1 decision was carried out: there are now four
workflows — `client.yml` (typecheck + lint + test), `server-unit.yml` (typecheck
on ubuntu and windows, `arch`, hermetic tests), `server-integration.yml`
(`*.it.test.ts` against a real Postgres) and `reviewer-core.yml`. A fifth,
`e2e-web.yml`, was deliberately deferred: it needs a running stack and a browser
driver, and a broken workflow is worse than a missing one.

What this changes for layer 3: **required checks now exist**, and one step
remains that cannot be done from the repository — enabling branch protection in
the GitHub settings and marking those jobs required. Until then, "forbid merging"
still means "advise strongly against".

So the plan has **three layers**, and the skill is only the middle one:

```
1. pre-push git hook       deterministic gates, ~30 s, no LLM  → blocks the push
2. pr-self-review skill    judgement against our own skills    → recommends
3. CI + branch protection  the only thing GitHub respects      → blocks the merge
```

Layers 1 and 2 are "before opening a PR", as asked. Layer 3 is mandatory if the
word "forbid" is to mean forbid rather than warn. **That is a decision for you**
(see §8).

## 1-bis. Two traps that break this construction specifically

Found while checking against the skill anti-pattern checklist. Both hit exactly
what is described above, so they are recorded before writing rather than after.

**Auto-invocation does not work headless.** Under `claude -p` a skill is **not**
activated on its own from its description. And layer 1 is a git hook — that is
precisely headless. If the hook relies on the agent "noticing" the skill, it will
not, and the hook will silently check nothing, which is worse than no hook.
Consequence for §5: the hook calls **either** a plain `scripts/pr-gates.sh` with
no agent at all (the preferred option — the §4a gates are deterministic anyway),
**or** `claude -p` with an **explicit** skill invocation in the prompt. Never rely
on automatic selection.

**A skill with side effects must not be auto-selected.** If the skill ever learns
to commit, push, open a PR or change a baseline, its frontmatter must carry
`disable-model-invocation: true` so it is only ever invoked by hand. In v1 the
skill only reads and reports, so the flag is unnecessary; it becomes mandatory
the moment "open the PR automatically" from §9 appears.

## 2. What exactly to check — the source of the diff

The skill looks at **all open changes**, not at commits:

```sh
git diff --merge-base origin/main    # working tree + index against the fork point
git status --short                   # plus new files, which are not in the diff
```

Merge-base rather than `origin/main` directly, or other people's commits from
main end up in our report. Uncommitted files are included — the whole point is to
check before committing.

Judge **only the changed lines**. This is critical: the backend already carries
11 recorded architecture violations in its baseline, and a skill that reports
them on every run will teach you to ignore it within two runs.

## 3. Routing: a file in the diff → a skill

The core of the task. One pass over the changed paths; each file gets a set of
skills, and each skill runs **once** over its own subset.

| Path in the diff | Skill / check |
| --- | --- |
| `client/src/**` | `frontend-ui-architecture` |
| `server/src/**` | `onion-architecture` |
| `server/src/db/migrations/**` | a separate branch — see below |
| `**/vendor/shared/**` | `scripts/check-shared.sh` + the "contract first" rule |
| `reviewer-core/**` | nothing of our own yet — types and tests only |
| `e2e/**` | its README as reference |
| `*.md`, `INSIGHTS.md`, `specs/` | skip judgement, check links only |
| `**/node_modules/**`, cloned repositories, `**/vendor/ui/**` | **never** |

Routing rules worth writing down explicitly:

- **An empty set is a valid result.** A PR touching only `docs/` should run no
  architecture skill at all.
- **A file can land in two skills** (a contract change touches both client and
  server) — that is fine; deduplicate findings by `file:line + rule`.
- Migrations are a special case: the rule "never edit an existing migration" is
  checked by diff, not by judgement — a modified **existing** file under
  `migrations/` is critical, a new file is fine.

**Updated 2026-08-10 — the skill inventory changed, and routing has to know:**

- `frontend-ui-architecture` is now **v1.1.0** and covers routing as well as file
  placement: when a section earns a `layout.tsx`, overlays as state rather than
  parallel/intercepting routes, `Link` versus `router.push`, the ban on
  `middleware.ts`. In practice, changes under `client/src/app/**` now have **two**
  grounds for findings rather than one, and a diff that adds a folder under
  `app/` must pass this skill.
- `react-component-quality` is **not a skill** — it is parked research with no
  `SKILL.md`. The router must never pick it up under any condition; if a
  `SKILL.md` ever appears, it earns its own row in the table above.
- The general rule for the router: **the source of truth is the presence of a
  `SKILL.md`**, not the name of a folder. Otherwise the first folder holding a
  draft starts influencing the verdict.

## 4. What "critical" means — it has to be defined, not felt

Otherwise every run gives a different answer. Two classes are proposed.

### 4a. Deterministic gates — critical by definition

No LLM, no interpretation. Red means red:

| Check | Command | Why critical |
| --- | --- | --- |
| Types | `pnpm typecheck` in the affected packages | broken build |
| Tests | `pnpm test` in the affected packages | broken behaviour |
| Architecture | `pnpm arch` (**new** violations only) | a layer boundary was crossed |
| Contracts | `./scripts/check-shared.sh` | client and server diverged |
| Migrations | diff over already-applied files | database history rewritten |
| Secrets | scan the diff for keys and tokens | a leak |

These six are layer 1 (the pre-push hook). They are cheap, deterministic, and
catch the most expensive mistakes without spending a single token.

**Updated 2026-08-10 — a seventh gate, but not critical yet.** The client gained
ESLint (`pnpm lint`, flat config with `react-hooks` and `jsx-a11y`). It **cannot**
be a gate today: every rule is deliberately downgraded to `warn`, so the command
always returns 0 (35 warnings at the time). Its correct place in this design is
not among §4a but as a **counter in the §6 report**: show the delta of warnings
the diff added. It becomes a gate the moment the rules are raised to `error`, and
that is when it moves into the table above. The same applies to the architecture
gate: the gate is "new violations only", never the full run.

### 4b. Findings from skills — these need a rubric

This is judgement, so the level must rest on **consequence**, not on how ugly
something looks:

- **critical** — changes behaviour to something wrong, loses data, breaks a
  contract, or bypasses a security boundary. A real example from an audit: a
  `delete` without a transaction before an `insert`; a failed request rendered as
  an empty state.
- **warning** — a skill rule is broken with no immediate harm: a service imports
  `fastify`, a new `export *`, a component promoted to a shared folder with no
  second consumer.
- **note** — style and small things. Never blocks.

**The anti-inflation rule:** a critical must come with a failure scenario in the
form "input → wrong output". If you cannot write one, it is a warning. Without
this clause the skill will be blocking every PR within a month and someone will
turn it off.

## 5. Order of execution

Cheap and deterministic first. There is no sense burning tokens on a file that
does not compile.

1. **Collect the diff**, classify the files (§3). Empty → exit with "nothing to check".
2. **Gates 4a** on the affected packages. Any failure → stop, report, exit non-zero. Go no further.
3. **Routed skills** over their subsets, in parallel.
4. **Deduplicate and classify** findings per §4b.
5. **Verify the criticals.** Each critical is checked again, by a separate pass
   that tries to **refute** it. Not confirmed → downgrade to warning. This is the
   main safeguard against false blocks.
6. **Report and verdict.**

## 6. The verdict, and what it looks like

```
PR self-review — 12 files (client 7, server 5)

  gates      typecheck OK · tests OK · arch OK · contracts OK
  critical   1
  warning    3
  note       2

BLOCKED — 1 critical finding

  client/src/.../AgentCard.tsx:41  failure-rendered-as-empty
    A failed useAgents() falls through to the empty branch; the user is
    invited to create a duplicate agent.
    → handle isError before length === 0

Override: PR_SELF_REVIEW=off git push   (recorded in the PR body)
```

Three principles for the output:

- **The verdict is the first line.** Do not make anyone read to find out whether
  they can proceed.
- **Every critical comes with an action**, not only a diagnosis.
- **An override must exist and must leave a trace.** A gate with no emergency
  exit gets bypassed entirely (`--no-verify`), and then you never hear about it.
  Make the override explicit and put it in the PR body.

## 7. What the skill does not do

- **It does not duplicate general code review or security review.** Those already
  exist and look for bugs and vulnerabilities broadly. This skill checks
  **conformance to our own rules** — the ones written in
  `frontend-ui-architecture` and `onion-architecture`. Overlap is driven to zero:
  if a finding does not rest on a line from one of our skills or on a §4a gate,
  it is not ours.
- **It does not rewrite code.** Report and verdict; fixes are a separate step, on
  a human decision.
- **It does not judge unchanged lines** (§2).
- **It does not open the PR.** It runs *before* that; creating the PR stays manual.

## 8. Decisions needed before writing

1. ~~**Do we create `.github/workflows/`?**~~ **Decided and done 2026-08-10** —
   four of five workflows exist (see §1). The question that replaces it: **who
   enables branch protection on GitHub, and which jobs become required.** That is
   a repository setting rather than a file, so it cannot be done from code — it
   needs owner access. Default: require `client / check`, `server-unit /
   typecheck`, `server-unit / arch`, `server-unit / test`; leave
   `server-integration` optional at first, because it is the most expensive and
   the newest.
2. **Do we install the `pre-push` hook for everyone?** Hooks do not travel through
   `git clone`. Options: `core.hooksPath` committed in the repo (works after one
   `git config`), husky (another dependency), or a Claude Code hook in settings —
   but that last one fires only when an agent pushes, not a person. Default:
   `core.hooksPath` plus a line in the README.
3. **Do warnings block?** Default: no, only criticals block, as you framed it.
   But then a cap on the number of warnings per PR is needed, or they accumulate
   forever.
4. **What do we do about the architecture baseline?** **10** known violations are
   currently ignored (it was 11 — one was fixed on 2026-08-10 and removed from
   the baseline). If a PR touches a file in the baseline and does **not** fix it,
   do we stay silent or remind once? Default: remind as a note, do not block. One
   more rule worth fixing immediately: **growth of the baseline is critical.** The
   known-violations file exists so the ratchet tightens; a PR that adds an entry
   to it removes the gate rather than passing it.

## 9. The scope of v1, and what comes after

**v1** — what gives 90% of the value for a day's work: collect the diff, routing
(§3), the 4a gates, our two skills, classification, verdict. Invoked by hand and
from `pre-push`.

**Later, as separate steps:** the CI workflow as a required check · pulling the
PR body template from the report automatically · tracking warning debt across PRs
· using our own review engine instead of direct judgement (we have a review
engine — eating our own cooking is the logical end state).

## 10. What will make it practical rather than ceremonial

Ten additions: six from the first pass (10a–10f) and four written on 2026-08-10
(10g–10j). The first is not cosmetic — without it the skill is a pure tax.

### 10a. A clean run has to give something back — a draft PR body

The design is currently asymmetric: if there are problems, the skill is useful;
if there are none, you spent a minute and got "OK". People stop running the thing
that gives them nothing in the typical case.

So the output is **always** a ready PR body, assembled from data the skill
already has: which packages were touched, what changed per module, which gates
passed and with what numbers, which skills ran, and a findings section. This is
exactly what our PR convention asks for ("what changed + how tested"), and now it
writes itself.

The side effect I like more than the main one: the PR body becomes
**machine-checked**. "Tested" stops being a promise in a text field.

### 10b. A skill that never found anything is indistinguishable from a broken one

It needs a fixture self-test: a set of known-bad diffs on which the skill **must**
produce specific findings. We already have perfect material — the state of the
repo before yesterday's fixes:

| Fixture | Expected finding |
| --- | --- |
| a script with a divergent enum | critical, `contract-drift` |
| a multi-write helper with no transaction | critical, `multi-write-without-transaction` |
| a dropdown component before the fix | critical, `failure-rendered-as-empty` |
| a new `routes.ts` importing `db/schema` | critical, `routes-no-db` |
| a new `export *` | warning |

A green self-test is the condition under which "0 findings" on a real PR means
anything. Run it in CI with the rest.

### 10c. A run → fix → run loop, not a one-shot check

Self-review is iterative by nature. The second run should look at the **delta
from the previous one** rather than re-examining everything: cache by diff hash,
carry confirmed findings forward, show `3 fixed · 1 new · 2 unchanged`.

Along with that, a time budget as an explicit requirement: gates ≤ 30 s, the
whole pass ≤ 2 min. What does not fit moves to CI. A skill that thinks for five
minutes gets bypassed with `--no-verify`, and you never find out.

### 10d. False positives must be cheap to suppress and expensive to hide

Suppression inline, but **with a mandatory reason**:

```ts
// pr-review-ignore: routes-no-db — read-only health probe, no service exists yet
```

No reason, not accepted — that is trivially checkable. Every suppression and
every override is collected; when one rule has been suppressed three times, the
rule is bad, and that is grounds to revisit the skill rather than the person.
Without this loop the §4b rubric ages silently.

### 10e. A large diff: honesty rather than silence

The working diff at the time was 37 files and 819 insertions; that is already
past one comfortable pass. The limit has to be explicit: split by module, judge
each separately, and if anything did not make it into the review, **say so in the
first line of the report**. Silent truncation reads as "all clear", which is the
worst possible outcome.

### 10f. Checks only our skill can make

General linters cannot do these — and this is exactly what distinguishes us from
a general code review:

- **Documentation freshness.** A new endpoint in `routes.ts` that is missing from
  the API map in the backend README → warning. A new convention in code with no
  line in the agent guide → note. That is exactly the drift we were clearing up.
- **A test where the testing guide requires one.** A new route, a new contract, a
  new migration with no corresponding test → warning. Not "coverage", but
  typology.
- **Tampering with the baseline.** The known-violations file regenerated while
  the violation count did not fall → **critical**. That is the only way to "fix"
  the architecture gate without fixing anything, and the skill has to see it.
- **Contract first.** A change in the shared contracts together with client
  changes but without the server side — the order was broken, warning.
- **A record that describes something already fixed.** Added 2026-08-10, after a
  single audit found three artefacts that lied: the root `INSIGHTS.md` described
  a fork of the shared package as live (the copies were identical), a `SKILL.md`
  listed four `export *` (there were none), and `TESTING.md` described five
  workflows as existing (there were none). This is not "stale documentation" from
  the first bullet — there the record **lags** the code, here it **contradicts**
  it. The rule: a PR that closes an item from `specs/` must update, in the same
  commit, the record that asserted the problem. An agent reads such a record as
  current intent and acts on it — which is why this is a warning, not a note.

---

**Added 2026-08-10 — four items that grew out of real observations in that
session rather than out of reasoning about what is correct.**

### 10g. A skipped gate is not a passed gate

The quietest way to get a lying "OK". The backend's `pnpm test` returns 0 even
when a third of the suite did not run: **12 of 36 test files** skip themselves
without Docker (`const d = hasDocker ? describe : describe.skip`, documented in
`TESTING.md`). On a machine with no Docker running, a verdict of "tests OK" means
"the hermetic tests passed, no DB-backed test ran" — which is precisely the class
of error the integration lane exists for, unchecked.

So in the §6 report a gate must have **three** states, not two: `OK` / `FAILED` /
`SKIPPED — <reason>`. And a `SKIPPED` among the critical gates is obliged to drop
the overall verdict to `INCONCLUSIVE`, not to `PASS`. This is the same principle
as 10e, but 10e is about a truncated diff rather than a gate that switched itself
off.

The same loop, for the future: `pnpm lint` is always green today (every rule is
`warn`) — the report has no right to present that as a passed gate.

### 10h. The verdict must be signed with skill versions

Skills are versioned and have already changed: v1.1.0 added routing rules that
v1.0.0 did not have. So two runs over the **same** diff can legitimately produce
different findings — and without a signature that looks like instability in the
skill rather than a change of rules.

The report should end with a line such as
`judged by: frontend-ui-architecture@1.1.0 · onion-architecture@1.0.0 · gates@<script sha>`.

**This also fixes a mistake in 10c:** a delta cache keyed only on the diff hash
will silently reuse findings produced under the old rules after a skill version
bump. The key must be `(diff hash, the set of skill versions, sha of
pr-gates.sh)`. Otherwise the one case where the delta matters most — "the rule
changed, what now?" — is served worst.

### 10i. A PR that changes a skill judges itself with the new ruler

A special case that breaks intuition: if the diff touches a `SKILL.md`, the
findings of that same run were produced by the **already changed** rules. At
minimum, say so in the first line. Beyond that, two cheap deterministic checks
suggest themselves:

- `SKILL.md` changed but `version:` in the frontmatter did not → warning. Without
  this the 10h signature lies, because two different rulers carry the same name.
- `SKILL.md` changed with no row added to the version history table → note.

And a practical one: a rule deleted from a skill by this very PR must not produce
findings in the same run. The example from that day was a stale mention of four
`export *` that no longer existed in the code: a skill still containing it would
have generated a phantom finding on a file nobody broke.

### 10j. Every critical must carry a reproduction command

§6 requires a finding to have an action. That is not enough: a person wants to
**see** the problem before believing in it. So alongside the action, exactly one
command that can be pasted into a terminal:

```
server/src/modules/pulls/routes.ts:238   transaction-in-route
  repro:  pnpm arch:all | grep routes-no-db
  fix:    move the transaction into service.ts
```

This is cheap — the §4a gates are commands anyway — and it has a side effect: a
finding for which no reproduction command can be written almost always turns out
to be judgement posing as fact, which makes it a candidate for warning under the
anti-inflation rule in §4b.

## 11. The files that will appear

```
.claude/skills/pr-self-review/
  SKILL.md          the skill itself: routing, rubric, order, report format
  README.md         sources plus the rationale for the levels
scripts/pr-gates.sh          the §4a gates, no LLM, usable by both the hook and CI
.githooks/pre-push           calls pr-gates.sh
.github/workflows/*.yml      ✅ already exist (2026-08-10) — all that remains is
                             calling pr-gates.sh from them instead of duplicated
                             steps, once the script exists
```

The key point in this layout: **the gates live in a script, not in the skill.**
The same `pr-gates.sh` runs from the hook, from CI and from the skill — otherwise
three copies of the rules diverge exactly the way two vendored copies of a shared
package once did.
