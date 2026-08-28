Skeleton of `server/src` as it exists before this PR. Directories only, plus the
files a structural reviewer has to know exist.

```
server/
  .dependency-cruiser.cjs                 9 arch rules, run by `pnpm arch`
  .dependency-cruiser-known-violations.json   11 recorded pre-existing violations
  package.json
  src/
    server.ts
    db/            schema/  migrations/  index.ts
    platform/      container.ts  config.ts  errors.ts  jobs.ts  sse.ts
                   resilience.ts  structured.ts  prompt.ts  price-book.ts
    adapters/      github/  git/  llm/  embedder/  secrets/  codeindex/
                   astgrep/  tokenizer/  mocks.ts  index.ts
    modules/       index.ts        <- static registry: one import + one entry per module
                   _shared/
                   settings/  repos/  pulls/  polling/  workspace/  agents/
                   skills/  conventions/  reviews/  repo-intel/  smart-diff/
                   blast/  brief/  project-context/  tour/
    vendor/shared/ Zod contracts + port interfaces (vendored)
```

Each `modules/<name>/` holds some of `routes.ts`, `service.ts`, `repository.ts`,
`helpers.ts`, `constants.ts`. Not every module has all five.
