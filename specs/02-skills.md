# Skills — reusable review rules shared across agents

**Status:** draft
**Packages touched:** server, client, `@devdigest/shared`
**Design:** [`design-mocks/src/14-screen_skills.jsx`](../design-mocks/src/14-screen_skills.jsx)
(Skills Lab) · [`design-mocks/src/17-screen_agents.jsx`](../design-mocks/src/17-screen_agents.jsx)
(Agent Editor → Skills tab)

---

## Problem

An agent today is a model plus one system prompt. Every rule an agent should
follow has to be pasted into that prompt, so two agents that share a rule keep
two copies, and fixing the rule means editing both. There is no way to say "this
house convention applies to every reviewer".

A **skill** is a named, versioned block of review guidance that exists
independently of any agent and can be attached to many. Editing a skill once
changes every agent that uses it.

## What already exists — and the one wire that is cut

Most of this feature is built. Measured 2026-08-09:

| Layer | State |
| --- | --- |
| DB: `skills`, `skill_versions`, `agent_skills` | **exist**, unused ([`schema/skills.ts`](../server/src/db/schema/skills.ts)) |
| Contracts: `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` | **exist** ([`knowledge.ts:115`](../server/src/vendor/shared/contracts/knowledge.ts)) |
| Agent side of the link: `linkedSkills` / `setSkills` / `skillLinks` | **exist** in `AgentsRepository` + `AgentsService` |
| Engine: accepts `skills?: string[]`, renders `## Skills / rules`, reports the slot in the trace | **exists** ([`reviewer-core/src/prompt.ts:88`](../reviewer-core/src/prompt.ts)) |
| Server: passes skills into the run | **cut** — [`run-executor.ts:436`](../server/src/modules/reviews/run-executor.ts) hard-codes `skills: null` |
| Server `skills` module (CRUD) | **missing** |
| Client Skills Lab page and Agent Editor Skills tab | **missing** |

So the work is: one new server module, two client surfaces, a contract change
for version pinning, and reconnecting one line in the run executor.

## Scope

**In**

- Skills CRUD: create from scratch, edit, rename, describe, enable/disable, delete.
- Versioning: every body change snapshots into `skill_versions`; version history readable.
- Agent linking: attach/detach, **ordered** (order decides prompt order), per agent.
- Assembly: linked skill bodies actually reach the review prompt, with a token budget.
- Reproducibility: an agent version pins the exact skill versions it ran with.

**Out** — separate specs, each needs a subsystem we do not have:

- The eval panel in the mock ("Run on 20", pass/fail cases) — needs the eval engine.
- Community skill search / import from file — needs a registry and, more
  importantly, a sanitisation story (see *Security*).
  **Update 2026-08-09:** import *from URL* shipped with `specs/03-conventions.md`
  (`POST /skills/import`), on the terms this spec set: the body is stored as
  `source: 'imported_url'` and the assembler wraps it in `<untrusted>` before it
  reaches a prompt (`modules/skills/importer.ts`, `helpers.ts:wrapUntrustedSkillBody`).
  Community search and file upload are still out.
- Convention extraction (`source: 'extracted'`, `evidence_files`) — the columns
  stay, nothing writes them in v1. **Shipped separately** in
  `specs/03-conventions.md`.

`source` was therefore `'manual'` in v1. Two of the four values are now written:
`'extracted'` by the conventions extractor and `'imported_url'` by the import
endpoint — both added by spec 03, both after this spec shipped.

## Hard constraint: a skill is text, nothing else

A skill body is **configuration text that ends up in a prompt**. It cannot
execute code, read files, call tools, or reference anything outside itself.
There is no template language, no variable interpolation, no includes. If a
skill body looks like it wants to *do* something, that is a prompt for the model
to act on, not a capability we grant.

This is a deliberate ceiling, and it is what makes skills safe to share and
cheap to reason about. Anything that needs behaviour is an agent setting or a
platform feature, not a skill.

## Security — where skill text lands in the prompt

Worth stating precisely, because it is not what the mock's copy says.

Every other external block is wrapped: `wrapUntrusted` covers the diff, the PR
description, the repo map, callers and specs, and `INJECTION_GUARD` tells the
model that anything inside `<untrusted>` is data, never instruction. **Skills
are the one block that is not wrapped** — they are joined raw into the user
message under `## Skills / rules` ([`prompt.ts:88,109`](../reviewer-core/src/prompt.ts)).

For v1 that is correct: skills are written by the workspace's own users, exactly
like a system prompt, and their whole purpose is to instruct. The rule to record
is the *boundary*:

> Author-written skills are trusted instruction. The moment a skill can arrive
> from a URL, a file, or a community registry, it becomes untrusted data and
> must be wrapped like every other external block — that is a required part of
> the import spec, not a follow-up.

The mock's Config-tab hint says "Skills are appended below [the system prompt]".
That is wrong about the mechanism — they go in the **user** message. Keep the
engine behaviour, fix the copy.

## Contract changes — `@devdigest/shared` first

Per repo rule, contracts change server-side first, then
`./scripts/check-shared.sh --fix` mirrors them to the client.

**1. Version pinning.** `AgentVersionConfig.skills` is `z.array(z.string())`
today, so replaying an old agent version silently uses *current* skill text.
Change to a pinned reference:

```ts
export const SkillRef = z.object({
  id: z.string(),
  /** The skill version this agent version ran with. Null = legacy row, unpinned. */
  version: z.number().int().nullable(),
});
```

`AgentVersionConfig.skills` becomes `z.array(z.union([z.string(), SkillRef]))` on
read, normalised to `SkillRef[]`. Existing `agent_versions` rows hold bare
strings; **do not rewrite them** — a legacy row honestly means "we do not know
which skill text this ran with", and rewriting it would invent history. New
snapshots always write the object form.

**2. Skill write/read shapes.** `Skill` exists for reads. Add
`CreateSkillInput` / `UpdateSkillInput` (name, description, type, body, enabled)
and `SkillVersion` (`skill_id`, `version`, `body`, `created_at`), mirroring the
agent equivalents.

**3. Link shape.** `AgentSkillLink` already carries `order`. Unchanged.

## Server

One new module, `server/src/modules/skills/`, following `onion-architecture`.
It earns a service by the criterion — versioning is a rule, and the body-change
snapshot spans two tables.

```
skills/
  routes.ts       HTTP + Zod schemas from @devdigest/shared
  service.ts      versioning rule, budget validation, transaction boundary
  repository.ts   skills + skill_versions
  helpers.ts      pure: isBodyChange, tokenEstimate
  constants.ts    limits
```

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/skills` | workspace-scoped list; `?type=`, `?enabled=`, `?q=` |
| POST | `/skills` | creates v1 + snapshot, in one transaction |
| GET | `/skills/:id` | |
| PUT | `/skills/:id` | body change bumps version + snapshots, one transaction |
| DELETE | `/skills/:id` | cascades links and versions |
| GET | `/skills/:id/versions` | newest first |
| GET | `/skills/:id/versions/:version` | single snapshot |

Agent-side linking already exists on `AgentsService.setSkills`; expose it if it
is not yet routed, and keep ownership there — `agents` owns the agent side of
`agent_skills`, `skills` owns the skill side. Neither reaches into the other's
tables.

Mirror the agents module exactly where behaviour matches (versioning, workspace
scoping, 404s). Do **not** copy `agents`' transaction gaps — they were fixed on
2026-08-09 and the new module starts with `insert`/`update`/link-replace already
transactional.

### Assembly — reconnecting the wire

In `run-executor.ts`, replace `skills: null` with the ordered, enabled bodies of
the agent's linked skills, resolved at the **pinned** version for a replay and at
current version for a live run. Record what was actually used in the run trace —
the `prompt_assembly.skills` slot already exists and already supports per-slot
token attribution.

### Budget

Two limits, both in `constants.ts`:

- **Per skill:** a maximum body length, validated on save, with the error naming
  the limit. A skill too large to save is better than one silently truncated.
- **Per assembly:** a maximum for the whole `## Skills / rules` block. On
  overflow, drop from the **end of the order** (the agent's own priority), never
  mid-body, and record the drop in the trace so it is visible in the Run Trace
  screen rather than being a mystery.

Starting numbers are a judgement call — propose 8 000 characters per skill and
24 000 for the block, then tune against the trace once real skills exist.

## Client

**1. Skills Lab — `/skills`** (mock 14). Three panes, but only two in v1:

- Left: list. Enable toggle, type badge (colour per `SKILL_TYPE`), source badge.
  Search box. "Add Skill" dropdown — in v1 only *Create from scratch* is active;
  the other three entries render disabled with a "coming soon" hint rather than
  being cut, so the menu matches the design and sets expectations.
- Centre: body editor. Markdown, monospace, an "unsaved" badge, Save. A live
  character/token count against the per-skill limit belongs here, next to Save.
- Right: the eval panel is **out of scope** — the pane collapses in v1 rather
  than shipping a fake.

**2. Agent Editor → Skills tab** (mock 17). All workspace skills listed, each
with an on/off for *this agent*, an "N of M enabled" badge, a filter, and
drag-to-reorder. The design's own line states the contract: "Order matters —
earlier skills appear earlier in the assembled prompt."

A globally disabled skill still appears here, marked `disabled`, and cannot be
enabled from this screen — same treatment the agent dropdown already gives
disabled agents.

Both surfaces follow `frontend-ui-architecture`: pages thin, feature UI in
`_components/<Name>/`, all data through `src/lib/hooks/skills.ts` → `api.ts`,
strings via `next-intl`, error and loading states handled beside the query.

## Semantics decided

| Question | Decision |
| --- | --- |
| Global `enabled=false` | Hard off. The skill enters no agent's prompt; links are preserved and shown as `disabled`. |
| Agent version replay | Pinned. Snapshots store `{id, version}`; legacy string rows read as unpinned and are left alone. |
| Ordering | Per agent, from `agent_skills.order`. The skill itself has no global order. |
| Overflow | Drop from the end of the order, record in the trace. |

## Acceptance criteria

1. A skill can be created, edited, disabled and deleted from `/skills`, and the
   list reflects each change without a reload.
2. Editing a body bumps `version` and appends to `skill_versions`; editing only
   the name or description does not.
3. Attaching two skills to an agent and reordering them changes the order of the
   blocks inside `## Skills / rules` in the next run's trace.
4. A review run by an agent with linked skills shows a non-null `skills` slot in
   the Run Trace, with the token count attributed to it.
5. Disabling a skill globally removes it from the next run's assembled prompt
   while the agent's link survives and reappears when re-enabled.
6. Replaying an agent version created before a skill edit uses the **pinned**
   older body, not the current one.
7. A body over the per-skill limit is rejected on save with a message naming the
   limit; an assembly over the block limit drops the tail and says so in the trace.
8. `./scripts/check-shared.sh` passes — both vendored copies carry the new contracts.
9. `pnpm arch` reports no new violations for the new module.

## Tests — per `TESTING.md` typology, not coverage

- **server unit (hermetic):** `isBodyChange` (name-only edit does not bump),
  assembly ordering, budget overflow drops the tail not the head.
- **server integration (`*.it.test.ts`):** create → edit → version history;
  link/reorder round-trip; a failed link replace rolls back (the pattern already
  proven in `agents-transactions.it.test.ts`); replay of a pinned version returns
  the old body.
- **client:** Skills Lab list renders type/source/enabled; the editor marks
  unsaved and blocks save over the limit; the Agent Editor tab reorders and shows
  a globally disabled skill as non-selectable.
- **e2e:** one flow — create a skill, attach it to a seeded agent, run a review,
  see the skill named in the Run Trace. Deterministic, no LLM.

## Implementation plan

Six phases. Each one ends in a state where the repo is green and something is
demonstrably true — no phase leaves a half-wired feature behind. Verification is
the same set of gates the repo already has; if a phase's gates are red, it is not
finished, regardless of how much of it is written.

The ordering has one non-obvious rule: **the prompt wire (phase 3) lands before
any UI.** Building the Lab first would mean a screen that edits rows nothing
reads, and the first honest test of the feature would be deferred to the end.

### Phase 1 — Contracts

Contracts move first; this is a repo rule, not a preference.

| File | Change |
| --- | --- |
| `server/src/vendor/shared/contracts/knowledge.ts` | add `SkillRef`, `CreateSkillInput`, `UpdateSkillInput`, `SkillVersion`; widen `AgentVersionConfig.skills` to the tolerant union |
| both vendored trees | `./scripts/check-shared.sh --fix` |

**Done when:** `pnpm typecheck` passes in both packages, `./scripts/check-shared.sh`
is green, and the tolerant union parses both a legacy `["s1"]` row and a new
`[{id,version}]` row — one hermetic test, since this is the only place where old
data meets the new shape.

### Phase 2 — Server module

`server/src/modules/skills/` — inside-out, per `onion-architecture`:
`constants.ts` → `helpers.ts` → `repository.ts` → `service.ts` → `routes.ts`,
then registered in `src/modules/index.ts`.

Every multi-write is transactional **from the first commit**: create (skill +
v1 snapshot), update (bump + snapshot), link replace. Do not repeat the pattern
`agents` had before 2026-08-09.

**Done when:** the seven endpoints answer; hermetic tests cover `isBodyChange`
and the budget helpers; a `skills.it.test.ts` covers create → edit → version
history and a rolled-back failed write; `pnpm arch` shows no new violations.

**Dependency:** phase 1 only.

### Phase 3 — The wire, and the first true statement

Replace `skills: null` in [`run-executor.ts:436`](../server/src/modules/reviews/run-executor.ts)
with the agent's ordered, enabled skill bodies — pinned version on replay,
current on a live run — and apply the assembly budget.

This is the smallest change in the feature and the one that makes it exist.

**Done when:** a run by an agent with linked skills shows a non-null `skills`
slot in the trace with tokens attributed; ordering in the trace matches
`agent_skills.order`; an over-budget assembly drops the tail and records it.
Covered by an integration test, not by eye.

**Dependency:** phase 2 (needs skills to exist to link).

### Phase 4 — Agent Editor → Skills tab

The smaller of the two client surfaces, and the one that exercises phase 3.
`client/src/lib/hooks/skills.ts` first, then
`app/agents/[id]/_components/AgentEditor/_components/SkillsTab/`.

Attach, detach, reorder, "N of M", filter, globally-disabled shown as
non-selectable.

**Done when:** reordering in the UI changes block order in the next run's trace —
the end-to-end statement, checked once by hand and then by the phase 6 flow.

**Dependency:** phase 3, so the tab controls something real.

### Phase 5 — Skills Lab

`app/skills/page.tsx` + `_components/`. Two panes: list (toggle, badges, search,
Add Skill dropdown with only *Create from scratch* active) and body editor
(unsaved badge, Save, live count against the per-skill limit). The eval pane
collapses; it is not stubbed.

**Done when:** create/edit/disable/delete round-trip without reload; over-limit
save is rejected with the limit named; loading and error states handled beside
each query.

**Dependency:** phase 2 for the API, phase 4 for the hooks file.

### Phase 6 — Prove it end to end, then write it down

One deterministic e2e flow (create skill → attach to a seeded agent → run review
→ see the skill in the Run Trace), seed fixtures if open question 3 resolves yes,
and the documentation that is easy to skip: `server/README.md` API map,
`client/README.md` route map, `client/AGENTS.md` if a new convention appeared,
and the `engineering-insights` skill at the end.

**Done when:** the flow passes with no LLM in the loop, and every doc that claims
to list routes actually lists the new ones.

### Gates, per phase

```sh
./scripts/check-shared.sh                      # phases 1, 6
cd server && pnpm typecheck && pnpm test       # 1-3
cd server && pnpm arch                         # 2, 3
cd client && pnpm typecheck && pnpm test       # 4, 5
cd e2e    && npm run e2e:hermetic              # 6
```

### Sequencing and what can run in parallel

```
1 Contracts ──► 2 Server ──► 3 Wire ──► 4 Skills tab ──┐
                                                        ├─► 6 e2e + docs
                                        5 Skills Lab ───┘
```

Phases 4 and 5 are independent once the hooks file exists — split them if two
people are working. Everything before 3 is strictly serial: each phase's
verification depends on the previous one being real.

### Where this can go wrong

Named in advance, because these are the parts most likely to be discovered late:

- **Budget numbers are guesses.** 8 000 / 24 000 characters have not been
  measured against a real assembled prompt. Expect to tune them in phase 3, and
  treat them as constants to revise, not a contract.
- **Legacy `agent_versions` rows.** The tolerant union is the whole migration
  story. If phase 1 skips the test that parses a legacy row, this surfaces as a
  runtime parse failure on someone's existing workspace.
- **Deleting a skill** cascades its links; an agent silently loses a rule and old
  versions point at a missing row. Open question 2 must be answered before phase
  2 ships `DELETE`, or the endpoint ships as archive-only.

## Seed fixtures — one agent, four skills

`pnpm db:seed` ships **one agent, `Test Quality Reviewer`, with four skills
attached in order.** This is the feature's demo, its e2e fixture, and the worked
example of what a good skill looks like, all at once — so the bodies have to be
real guidance, not lorem ipsum.

The content comes from [`TESTING.md`](../TESTING.md), which already states this
repo's testing doctrine. Seeding our own doctrine means the example agent says
something true about this codebase on first run, and it gives every later skill
a house style to imitate.

| # | Name | Type | What the body says |
| --- | --- | --- | --- |
| 1 | `test-typology` | `rubric` | Judge whether the change adds the *kind* of test that catches its class of regression. Coverage percentage is not the question; an untested new branch in a data path matters, an untested rename does not. |
| 2 | `assertions-that-can-fail` | `convention` | A test that still passes with the change reverted proves nothing. Flag tests whose assertions cannot distinguish the new behaviour from the old — vacuous `toBeDefined`, snapshots of nothing, mocks asserting themselves. |
| 3 | `hermetic-boundaries` | `convention` | `*.it.test.ts` may use the real Postgres; every other server test must be hermetic. Flag network, real clock, filesystem or DB access outside that suffix, and point at `src/adapters/mocks.ts` as the seam. |
| 4 | `seam-not-internals` | `rubric` | Test at the seams — routes, adapters, contracts, the rendered component — not at private helpers. A test that breaks on a refactor with no behaviour change is a liability, and one that reaches into internals will. |

Skill 2 is the one worth having even alone: it is the failure mode that makes a
green suite meaningless, and it is exactly what caught a real gap here on
2026-08-09 — a rollback test only proved something once the transaction was
temporarily removed and the test was watched to fail.

**If three is preferred to four,** merge 4 into 1 — they are both "is this the
right test", where 2 and 3 are mechanical checks that stand alone. Do not drop 2
or 3.

Ordering matters and is part of the fixture: 1 → 2 → 3 → 4, so the broad
judgement frames the specific checks. That ordering is also what phase 4's
reorder test perturbs, which makes the e2e assertion meaningful rather than
arbitrary.

The agent itself reuses the existing agent shape — no new fields — with a system
prompt that says it reviews test quality and defers the specifics to its skills.
It seeds `enabled: true` so a first-run review actually exercises the wire from
phase 3. Seeding stays idempotent, like the rest of `db:seed`.

## Open questions

1. **Limits.** 8 000 / 24 000 characters are proposals, not measurements. Worth
   setting against a real assembled prompt before they become a contract — and
   the four seed skills are the first realistic sample to measure against.
2. **Delete vs archive.** A deleted skill cascades its links, so an agent
   silently loses a rule and old agent versions point at a row that no longer
   exists. Soft-delete would preserve replay. Not decided; blocks `DELETE`
   shipping in phase 2.
3. ~~**Seeding.**~~ Decided — see *Seed fixtures* above.
