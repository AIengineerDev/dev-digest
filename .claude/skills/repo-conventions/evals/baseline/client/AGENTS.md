# client (`@devdigest/web`) — agent notes

## Commands

```sh
pnpm dev · pnpm build · pnpm typecheck · pnpm test
```

## Conventions

- All data access goes through a hook in `src/lib/hooks/*`. Components never
  call `fetch` directly.
- Types for API payloads come from `@devdigest/shared`. Do not redeclare them.
