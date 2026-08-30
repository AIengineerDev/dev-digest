# Export to CI — remediation, round 1 (PR C)

**Parent plan:** `plans/15-export-to-ci.plan.md` (phases 3–7)
**Source:** plan-verifier pass 1 — 2 items `not met`, plus one tenancy gap it
observed outside the checklist.
**Authored by:** the `/impl` driver, not `implementation-planner` — three small,
fully-specified fixes under time pressure. Stated rather than hidden.

## Phase 1 — the truncated action SHA (verifier item 9, `not met`)

- **Problem:** `server/src/modules/ci/constants.ts:26` pins
  `SETUP_NODE_ACTION_SHA = '60edb5dd545a775178f52524783378180af0d1f'` — **39 hex
  characters.** A git SHA is always 40. Every exported workflow therefore
  references an `actions/setup-node@<ref>` that cannot resolve, and the job dies
  at the setup step. A5 requires every `uses:` to match `@[0-9a-f]{40}`.
- **The correct value, verified against GitHub** (`gh api
  repos/actions/setup-node/git/ref/tags/v4.0.2`): the constant lost its trailing
  character. Replace with `60edb5dd545a775178f52524783378180af0d1f8`. Keep the
  `// actions/setup-node@v4.0.2` comment — the tag it names is right.
- **Do not** bump to a different version. The pin is correct; only the string is.
- **Gate:**
  ```
  cd server && pnpm typecheck
  grep -oE "'[0-9a-f]{30,45}'" src/modules/ci/constants.ts | tr -d "'" | awk '{print length($0)}'
  ```
- **Done when:** both SHAs print `40`.

## Phase 2 — a traversal-shaped skill name is renamed, not rejected (verifier item 8, `not met`)

- **Problem:** `helpers.ts:27-32,40-54`. `slugify('../etc')` strips non-alnum runs
  and trims, yielding `"etc"` — non-empty, so `uniqueSlugs` never throws. The
  plan's C7 criterion is that *"a skill named `../etc` is rejected by name"*.
  It is silently renamed instead.
- **Not a live path-traversal risk** — the derived slug cannot escape
  `.devdigest/skills/` — so this is about the stated criterion and about failing
  loudly rather than exporting a file under a name the author did not choose.
- **Fix:** before slugifying, reject a raw name containing a path separator
  (`/` or `\`) or a `..` segment, with a `ValidationError` that names the skill —
  matching the existing empty-slug error's shape and message style at
  `helpers.ts:44-49`. Keep the existing empty-slug check for names that reduce to
  nothing for other reasons.
- **Gate:** `cd server && pnpm typecheck && pnpm arch`
- **Done when:** a skill named `../etc` throws a `ValidationError` naming it; an
  ordinary name like `Security Basics` still slugifies to `security-basics`.

## Phase 3 — `ci-installations` is not workspace-scoped

- **Problem:** `server/src/modules/ci/service.ts:173-182` and `routes.ts:40-47`.
  `GET /agents/:id/ci-installations` calls `getContext` for auth but lists by
  `agentId` alone, never checking the agent belongs to the caller's workspace. A
  valid session can read another workspace's installation rows — which repos it
  exports to, and when. Found by the verifier outside the plan's checklist.
- **Fix:** resolve the agent through the workspace-scoped read the module already
  uses elsewhere (`container.agentsRepo.getById` with the context's workspace, as
  `service.ts:54` does) and 404 when it does not resolve, before listing.
- **Gate:** `cd server && pnpm typecheck && pnpm arch`
- **Done when:** the handler cannot return rows for an agent outside the caller's
  workspace; an in-workspace agent still lists its installations.

## Out of scope

The two architecture findings — the third copy of `SECRET_KEY_BY_PROVIDER`, and
`AgentCard`'s per-card `useCiInstallations` query. Both are low, both are recorded
in the PR body, neither ships a defect.
