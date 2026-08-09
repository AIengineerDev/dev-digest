# deprecation-policy

How to remove something from a public contract without breaking the callers you
cannot see. This is the remedy the other three skills point at: `breaking-change`
says a removal is breaking, and this says what to do instead.

A public thing is retired in three steps, never one:

1. **Announce.** The replacement ships alongside the old thing. The old one is
   marked `@deprecated` with the version it goes away in and what to use instead.
   Both work, and the old path keeps its exact previous behaviour.
2. **Warn.** The deprecated path stays for at least one minor release. If it is a
   route, it logs a deprecation warning naming the caller; if it is a type, the
   annotation carries the date.
3. **Remove.** The removal happens in a major version, and appears in the
   changelog under a **Breaking** heading with the migration in it.

A deprecation without a stated removal version is not a deprecation — it is a
comment, and it will still be there in three years.

## Bad — the silent delete

```ts
export const PrSummary = z.object({
  id: z.string(),
- last_reviewed_sha: z.string().nullable(),
  head_sha: z.string().nullable(),
});
```

Nothing in the repo referenced `last_reviewed_sha`, so the diff is green. Every
external client that did read it now reads `undefined`, and finds out at runtime,
in production, with no message telling them what replaced it.

## Bad — deprecated, but with no exit

```ts
/** @deprecated use head_sha */
last_reviewed_sha: z.string().nullable(),
```

No version, no date, no removal plan. Nobody migrates, and the field is now
permanent.

## Good — announced, dated, and scheduled

```ts
export const PrSummary = z.object({
  id: z.string(),
  /**
   * @deprecated since 2.4 (2026-08-09) — removed in 3.0.
   * Use `head_sha`: this field only ever held the head of the *last reviewed*
   * revision, which is a different question from "what is this PR at now".
   */
  last_reviewed_sha: z.string().nullable(),
  head_sha: z.string().nullable(),
});
```

## What to flag

- A public field, route, or enum value removed in a diff with no deprecation
  period behind it.
- A `@deprecated` marker with no removal version.
- A deprecated path whose behaviour was changed while deprecated — a caller that
  has not migrated yet is still a caller.

## What to say

Name what is being removed, when it was deprecated (or that it never was), and
the smallest change that restores the migration path: re-add the field as
deprecated and schedule the removal for the next major.
