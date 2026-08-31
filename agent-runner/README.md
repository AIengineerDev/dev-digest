# `@devdigest/agent-runner`

The CI half of an exported DevDigest agent. This package does **not** run in
this repository — it runs inside `.github/workflows/devdigest-review.yml` on
a **target** repository, committed there as `.devdigest/runner.mjs` by the
Export-to-CI feature (`server/src/modules/ci/`).

On every PR it:

1. Loads `.devdigest/agents/<slug>.yaml`, validates it as an `AgentManifest`.
2. Loads each linked skill's body from `.devdigest/skills/<slug>.md`.
3. Computes `git diff <base>...<head>` itself (`src/diff.ts`) — it never asks
   the studio for a diff (R10/A10: PR freshness there is a side effect of a
   GET route, not a source of truth for CI).
4. Calls `reviewPullRequest` (`@devdigest/reviewer-core`) with an injected
   `OpenRouterProvider`.
5. Posts the review via its own `@octokit/rest` client.
6. Exits `1` when `countBlockers(findings, manifest.ci_fail_on) > 0`, else `0`.

Why it exists and the decisions behind it:
`plans/15-export-to-ci.plan.md` Phases 1–2, `specs/15-export-to-ci.md`.

## Commands

```sh
npm install
npm run typecheck   # tsc --noEmit — this package never emits with tsc
npm run build       # ncc build src/index.ts -o dist --minify — the real bundle
npm test            # vitest — currently zero suites; see AGENTS.md
```

## Conventions

See `AGENTS.md` for the packaging rules (npm not pnpm, no `tsc` emit, why
`@devdigest/shared` and `@devdigest/reviewer-core` are consumed as source).
