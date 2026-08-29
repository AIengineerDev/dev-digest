# DevDigest — agent map

## Before answering

Before answering any question or starting any task, FIRST search the relevant
package's `docs/`, `specs/` and `INSIGHTS.md` for what was asked about. These are
curated and may already answer it in full. Only after that, read the code.

Order: `<module>/specs/` (what we intend to build) → `<module>/docs/` (how it
works) → `<module>/INSIGHTS.md` (what we already tried and rejected) → source.
If a curated file answers the question, cite it instead of re-deriving from code.

## After finishing

Run the `engineering-insights` skill at the end of any non-trivial task. It
records what was learned into the `INSIGHTS.md` of the module you touched, after
checking that a similar entry isn't already there. **Do not skip this step.**

Skip only the writing, and only when nothing non-obvious came up — a typo or a
routine change is not an insight, and noise costs more than silence.

## Stack

Node ≥22 · pnpm ≥10 · TypeScript · Fastify 5 · Next.js 15 / React 19 ·
Drizzle ORM + Postgres (pgvector) · Zod · Vitest · agent-browser (e2e)

## Commands

| Task            | Command                                                    |
| --------------- | ---------------------------------------------------------- |
| Boot everything | `./scripts/dev.sh` (Postgres + API :3001 + web :3000)      |
| Server          | `cd server && pnpm dev \| build \| typecheck \| test \| arch` |
| Migrations      | `cd server && pnpm db:generate` then `pnpm db:migrate`     |
| Client          | `cd client && pnpm dev \| build \| typecheck \| test \| lint` |
| Engine          | `cd reviewer-core && npm test \| npm run typecheck`        |
| E2E (hermetic)  | `cd e2e && npm run e2e:hermetic`                            |
| MCP server      | `cd mcp && npm test \| npm run typecheck`                   |
| Evals (free)    | `cd evals && pnpm eval:quality`                             |
| Evals (spends)  | `cd evals && pnpm eval:skills \| eval:agents \| eval:workflow` |

Flags for `dev.sh`: `--no-seed` · `--no-client` · `--db-only` · `--help`.

Two gates are **baselined**, so green means "nothing new", not "clean":
`server pnpm arch` ignores an 11-entry known-violations file, and
`client pnpm lint` exits 0 with 43 pre-existing warnings. Never regenerate the
arch baseline and never `lint --fix` them as part of a feature.

`server pnpm test` is unfiltered and includes the 15 `*.it.test.ts` files, which
pull up Postgres via testcontainers. While iterating, scope it:
`pnpm exec vitest run --reporter=dot --exclude '**/*.it.test.ts' test/<topic>`.

## Where things live

| Path                        | What                                                     |
| --------------------------- | -------------------------------------------------------- |
| `server/`                   | Fastify API + Drizzle. Indexer at `src/modules/repo-intel/` |
| `client/`                   | Next.js studio, App Router                                |
| `reviewer-core/`            | Pure engine: diff + repo map → prompt → LLM → findings    |
| `e2e/`                      | Deterministic browser flows, no LLM                       |
| `mcp/`                      | `devdigest-mcp` — the reviewers as MCP tools over stdio    |
| `evals/`                    | Two harnesses: `run.ts` (A/B fixtures, needs a key) · `eval.ts` (live sessions, your Claude login) |
| `server/src/vendor/shared/` | `@devdigest/shared` — Zod contracts for every package     |
| `client/src/vendor/ui/`     | `@devdigest/ui` — vendored UI primitives                  |

## Conventions (non-default — you cannot infer these from the code)

- **`AGENTS.md` is the real file; `CLAUDE.md` is a symlink to it** in every
  package. Edit `AGENTS.md` — never replace the symlink with a copy, or the two
  will drift.
- **Not a monorepo workspace.** Each package has its own `package.json` and its
  own lockfile. `server/` + `client/` use **pnpm**; `reviewer-core/`, `e2e/` and
  `mcp/` use **npm**. Never run the wrong package manager in a package.
- Cross-package imports resolve through **tsconfig path aliases**, not published
  modules. `reviewer-core` and `mcp` are consumed as TypeScript **source** and
  never emit JS — their `build` is a typecheck. A package that path-aliases into
  `server/src/vendor/shared` **cannot** emit: tsc pulls those sources into the
  program and writes them under its `dist/` too.
- Contracts change in `@devdigest/shared` **first**, then in consumers. The same
  Zod schema drives request validation and response serialization.
- Server tests split by filename: `*.it.test.ts` are DB-backed (testcontainers
  Postgres). Everything else must stay hermetic.
- Secrets live in `~/.devdigest/secrets.json` (mode 0600) with `process.env` as
  fallback — never in git or the database.

## After changing a skill, an agent, or this file

These artefacts have no type checker and no test suite of their own — a broken
skill description or a renamed agent fails silently, at routing time, in someone
else's session. `evals/` is what catches that. Run the row that matches what you
touched, from `evals/` (see `evals/README.md` for the two harnesses and why
`eval:quality` is the only one safe to block CI on):

| You changed | Minimum check |
| --- | --- |
| `.claude/skills/**` | `pnpm eval:quality`, plus that skill's own eval if it has one (`evals/skills/<name>/`) |
| `.claude/agents/**` | `pnpm eval:quality`, plus `pnpm eval:agents --suite <name>` and the workflow case that dispatches it |
| `AGENTS.md` / `CLAUDE.md` / routing rules | `pnpm eval:workflow` — this file IS the thing under test |
| an eval case, a fixture, or a grader | re-run the baseline series and re-label it; a scorer change invalidates every number recorded before it |

`pnpm eval:quality` is free and takes ~100 ms. The model levels spend real money
and authenticate with your Claude login, so they run on request, not on every
commit. A new skill should arrive with its cases — `eval:quality` reports the
gap as a warning, and a skill that never gets one keeps that warning forever.

## Gotchas

- **Migrations do not run on boot.** `relation ... does not exist` means you
  skipped `pnpm db:migrate`.
- **Never `docker compose down -v`** to "reset" — `-v` destroys the
  `devdigest_pgdata` volume and every imported repo and review with it.
- The server reaps orphaned `running` runs on boot; a run stuck in `running` is
  usually a crashed process, not a logic bug.

## Do not touch

- `server/clones/**` — cloned user repos, including a full copy of dev-digest
  itself. **Always exclude it from grep and glob** or you will read and edit the
  wrong file. Gitignored; never commit its contents.
- `**/src/vendor/**` — vendored. Exception: `vendor/shared` changes only as part
  of a deliberate contract change.
- `server/src/db/migrations/**` — generated by `pnpm db:generate` and already
  applied to existing databases. Never hand-write or edit a migration file: to
  change the schema, edit the table in `server/src/db/schema/<area>.ts`
  (`schema.ts` is only the barrel) and generate a new migration.
- `**/node_modules/**`, `pnpm-lock.yaml`, `package-lock.json`.

## Read when

- Read `specs/` before building a feature that spans more than one package —
  intent and done-criteria live there. Single-package work goes in that
  package's `specs/` instead. Specs are authored by the `spec-creator` agent, which
  only ever **creates** them: a revision is a new numbered file, never an edit.
- Run `spec-creator` then `implementation-planner` by hand, one at a time, then
  `/impl <plan path>` to drive build → verify → review → accept → ship. It is
  stage-at-a-time and resumable from `plans/*.run.md`.
- Read `plans/` for how an agreed spec gets built — phases or parallel tracks,
  with the gate commands that prove each one. `plans/NN-*.plan.md` matches
  `specs/NN-*.md` by number. Written by `implementation-planner`, checked by
  `plan-verifier`.
- Read `docs/` for how the system works today across packages, before changing
  anything that already runs.
- Read `design-mocks/INDEX.md` when the work has a design — 28 extracted screen
  and component modules. **Never** open `DevDigest Design (standalone).html` at
  the repo root; it is a 1.8 MB base64 bundle and reading it wastes the context
  window.
- Read `TESTING.md` when adding a test or touching CI.
- Read `docs/agent-prompts/` when changing a built-in agent's system prompt or
  choosing a model.
- Read `server/README.md` when adding or changing an API route.
- Read `client/README.md` when adding a page or a data hook.
- Read `reviewer-core/README.md` when touching prompt assembly, structured
  output, or the grounding gate.
- Read `e2e/README.md` before writing or debugging a browser flow.
- Read `mcp/AGENTS.md` before adding or changing an MCP tool — the token budget
  it has to stay under is not inferable from the code.
- `/workflow-retro` is a **human-invoked** retrospective on a multi-agent run: it measures
  what the session cost and proposes prompt changes, with durable findings in
  `docs/retro/ledger.md`. No agent or skill may launch it — offer it, never run
  it. `/workflow-retro deep` widens the scope to every session, for trends.
- Read `INSIGHTS.md` at repo root for decisions that span more than one package.
- Use the `engineering-insights` skill to read or record an insight — it maps a
  touched path to the right `INSIGHTS.md` and holds the format and quality bar.
