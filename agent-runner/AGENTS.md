# agent-runner (`@devdigest/agent-runner`) — agent notes

**npm, not pnpm.** This package has its own `package-lock.json`, same as
`reviewer-core` and `mcp`. A `pnpm install` here produces a `pnpm-lock.yaml`
that breaks the "single lockfile per package" convention and, for this
package specifically, fails the plan's A13 check.

**This package runs on someone else's machine.** It is bundled and committed
into a target repository's own `.github/workflows/devdigest-review.yml` run,
with `GITHUB_TOKEN` and a provider API key in scope. Nothing here may make an
HTTP request to the DevDigest studio — there is no code path back to it, on
purpose (R10/A10). Treat any addition that constructs a URL from config as a
defect, not a feature.

## Consumption of `@devdigest/shared` and `@devdigest/reviewer-core`

Both are reached through `tsconfig.json` path aliases and consumed as
TypeScript **source** — same arrangement as `mcp` (`mcp/tsconfig.json:22-30`)
and as `reviewer-core` consumes `@devdigest/shared` itself
(`reviewer-core/tsconfig.json`). This package **never emits with `tsc`**:
`build` is `tsc --noEmit`, i.e. a type-check only. An `outDir` would pull the
aliased sources into the program and write them under this package's own
`dist/` too — already learned twice
(`reviewer-core/src/index.ts:9-11`, `mcp/tsconfig.json:22-26`).

**The real bundle is `@vercel/ncc`.** `npm run build` runs
`ncc build src/index.ts -o dist --minify`, which resolves the path aliases at
bundle time and produces one self-contained `dist/index.js`. This is what the
Export-to-CI generator (Phase 3+) embeds verbatim as
`.devdigest/runner.mjs` in a target repo's PR — there is no npm publish, no
registry, and no network fetch of our own code at workflow run time. After
the first real build, check by hand that no `dist/**/vendor/shared/**` path
exists in the bundled output (A13) — nothing asserts this mechanically.

The `zod` path alias in `tsconfig.json` pins this package's own `z`-typed
code and the schemas re-exported from `@devdigest/shared` to the same
installed copy of `zod` (mirrors `reviewer-core/tsconfig.json`) — without it,
`instanceof` checks against a shared-defined schema's errors can silently
fail across two different `zod` module instances.

## Diff parsing is owned here, not imported

`src/diff.ts`'s `parseUnifiedDiff` is a line-for-line port of
`server/src/adapters/git/diff-parser.ts:14` (R9 — the runner computes its own
diff; it must not import server internals, which would also break the
`onion-architecture` layering that file lives inside). Any bug fix to one
must be mirrored in the other until they are consolidated into
`reviewer-core` (`plans/15-export-to-ci.plan.md` Recommendation 2, not done
in this plan).

The diff itself comes from `git diff <base>...<head>` run through
`execFile` with an **argument array**, never a shell string
(`src/diff.ts`'s `computeDiff`) — a PR branch named `$(id)` or containing
backticks must reach `git` as one literal argv entry, never a shell (C11).

An empty diff (e.g. a shallow checkout missing `head` —
`server/INSIGHTS.md:288-294` records this as a real failure mode, not a
hypothetical) is **not** an error from `computeDiff`; the caller in
`src/review.ts` is the one that must log "no reviewable diff" and exit 0
rather than reporting a clean review (C9).

## Fork detection reads the event file, never a header

`src/env.ts`'s `isForkPr` reads `GITHUB_EVENT_PATH` and compares
`pull_request.head.repo.full_name` against `GITHUB_REPOSITORY` — GitHub does
not hand repository secrets to a fork PR run, so this is a courtesy check,
not the actual security boundary. It exists so a fork PR gets a clear,
logged reason instead of a confusing "provider key not configured" (C10).

## Tests

Per `plans/15-export-to-ci.plan.md` `## Tests`, the implementer writes none
in Phases 1–2. `vitest.config.ts` is scaffolded so the package is
test-ready; `npm test` currently passes with zero suites
(`--passWithNoTests`). If that per-package exception is taken later, the
four highest-value suites are named in the plan: `run`, `fork`, `untrusted`,
`bundle`.
