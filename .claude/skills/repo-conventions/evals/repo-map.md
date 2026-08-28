Structure of the repository before this PR. **Layout only** — what exists and
where, with no statement about how any of it is meant to be used.

```
AGENTS.md
CLAUDE.md
client/
  AGENTS.md   CLAUDE.md
  package.json   pnpm-lock.yaml
  src/app/  src/lib/hooks/  src/lib/api.ts  src/vendor/shared/  src/vendor/ui/
server/
  AGENTS.md   CLAUDE.md
  package.json   pnpm-lock.yaml
  .dependency-cruiser.cjs   .dependency-cruiser-known-violations.json
  clones/
  src/vendor/shared/  src/db/schema/  src/db/migrations/
  src/modules/  src/adapters/  src/platform/
  test/
reviewer-core/   package.json   package-lock.json   src/
e2e/             package.json   package-lock.json
mcp/             package.json   package-lock.json   src/
scripts/         check-shared.sh  dev.sh  e2e.sh
.github/workflows/  client.yml  server-unit.yml  server-integration.yml
                    reviewer-core.yml  mcp.yml
```
