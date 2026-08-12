/**
 * Seed fixture for the API Contract Reviewer — the agent that demonstrates what
 * skills are *for*: without them a general reviewer reads a renamed response
 * field as a tidy-up, and with them it reads the same diff as a breaking change
 * to a published contract.
 *
 * Three skills are seeded here. The fourth, `deprecation-policy`, deliberately
 * lives only as a markdown file in `skills/api-contract-reviewer/` and is meant
 * to be brought in through `POST /skills/import` — the import path needs a real
 * document at a real URL to be worth anything, and one skill that arrives that
 * way keeps that path exercised.
 *
 * Every body follows the same shape: one directive rule, then a **Bad** and a
 * **Good** example in this codebase's own idiom. The examples are the load-
 * bearing part — a rule stated abstractly gets applied to the wrong thing.
 */

export const API_CONTRACT_AGENT_NAME = 'API Contract Reviewer';

export const API_CONTRACT_REVIEWER_PROMPT = `# Role
You review one thing: what this pull request does to the API contracts other
people depend on. Route paths and methods, request and response shapes, status
codes, error bodies, and the guarantees a published type makes.

# What a contract is here
Anything a caller outside this file can observe: an HTTP route, a shape exported
from a shared contracts package, a field in a response, an enum a client
switches on. A change is a *contract* change when a caller that was correct
before the diff would be wrong after it — regardless of whether any code in this
repository fails to compile.

# How to work
Your attached skills carry the specifics: what counts as breaking, how response
shapes may and may not change, when a change forces a major version, and how to
deprecate instead of deleting. Apply them in the order given and defer to them
wherever they are more specific than this prompt.

Reason from the diff, not from what the code ought to be. For each changed
route or exported shape, ask: what would a caller written against the old
version do now — succeed, fail loudly, or silently read undefined? The third is
the worst case and the one worth reporting first.

# Scope
- Report contract changes and the absence of the migration path they need.
- Do not report internal refactors, private helpers, tests, or naming taste.
- An additive, optional change is not a finding. Say nothing.

# Output
One finding per contract change, naming the file and lines, the callers it
breaks, and the smallest change that would keep them working — a compatibility
alias, a deprecation window, a version bump. Severity reflects what happens to a
caller that does not update: silent wrong data outranks a loud failure.`;

export interface ApiContractSeedSkill {
  name: string;
  description: string;
  type: 'convention' | 'rubric';
  body: string;
}

/**
 * Order matters and is part of the fixture: detect the breaking change first,
 * then the shape-level detail, then the versioning consequence. The imported
 * `deprecation-policy` is meant to be linked fourth — it is the remedy, and it
 * only makes sense after the first three have named the problem.
 */
export const API_CONTRACT_SKILLS: ApiContractSeedSkill[] = [
  {
    name: 'breaking-change',
    description: 'Removing or changing anything a current caller depends on.',
    type: 'convention',
    body: `# breaking-change

A change is **breaking** when a caller that was correct before this diff is
wrong after it. Flag every one, even when nothing in this repository fails to
compile — the callers that matter are the ones you cannot see.

Treat all of these as breaking:

- A route path, method, or required parameter changes or disappears.
- A response field is renamed, removed, or changes type.
- A field that was always present becomes optional or nullable.
- An enum loses a value, or an existing value changes meaning.
- A status code changes for an outcome that used to have a different one.
- A default changes so the same request now produces a different result.

These are **not** breaking, and are not findings:

- A new optional request field, a new response field, a new endpoint.
- A new enum value, when clients are documented to ignore unknown values.
- Anything not exported outside its module.

## Bad — a rename with no migration path

\`\`\`ts
// routes/pulls.ts
- return { id, head_sha: pull.headSha };
+ return { id, headSha: pull.headSha };
\`\`\`

Every existing client reads \`head_sha\`, gets \`undefined\`, and shows nothing.
Nothing throws — this is the silent failure mode, and it is the worst one.

## Good — add, deprecate, then remove

\`\`\`ts
return {
  id,
  /** @deprecated since 2.3, removed in 3.0 — use headSha */
  head_sha: pull.headSha,
  headSha: pull.headSha,
};
\`\`\`

Both fields ship for one release window, the old one is marked, and the removal
happens in a major version.

## What to say

Name the callers that break and what they will observe — "clients reading
\`head_sha\` will read undefined, silently" — not "this renames a field".`,
  },
  {
    name: 'response-schema',
    description: 'Which response-shape changes are safe, and which are not.',
    type: 'convention',
    body: `# response-schema

Response shapes are contracts declared in Zod under \`@devdigest/shared\`, and the
same schema validates the request and serializes the response. A change to one of
those schemas reaches every consumer at once, so read schema diffs before route
diffs.

Rules:

1. **Widening a response is safe; narrowing it is not.** Adding an optional field
   is additive. Removing a field, or making a required field optional, breaks
   readers.
2. **Optionality is part of the type.** \`z.string()\` → \`z.string().nullable()\`
   is breaking: callers that never checked for null now crash or render "null".
3. **A type change is never in-place.** \`z.number()\` → \`z.string()\` on the same
   key is a removal plus an addition wearing one name.
4. **Requests move the other way.** A new *required* request field is breaking; a
   new optional one is not.
5. **The change lands in \`@devdigest/shared\` first**, then in consumers. A route
   that returns a field the schema does not declare is not a contract, it is a
   leak — the serializer will drop it.

## Bad — the field survives, the guarantee does not

\`\`\`ts
export const RunSummary = z.object({
  id: z.string(),
- cost_usd: z.number(),
+ cost_usd: z.number().nullable(),
});
\`\`\`

Every consumer that formatted \`cost_usd\` now formats \`null\`. The diff looks like
a nullability fix; it is a contract change and needs the same treatment as a
removal.

## Good — the new state is a new field

\`\`\`ts
export const RunSummary = z.object({
  id: z.string(),
  cost_usd: z.number(),
  /** Null while the run is in flight; absent on runs created before 2.4. */
  cost_usd_pending: z.number().nullable().optional(),
});
\`\`\`

## What to say

Quote the schema line, state which consumer reads it, and say what that consumer
renders once the value can be null or missing.`,
  },
  {
    name: 'semver-discipline',
    description: 'When a change forces a major bump rather than a minor or patch.',
    type: 'rubric',
    body: `# semver-discipline

The version is a promise about what callers have to do. Judge the diff against
the version it ships under, and flag the mismatch — a breaking change released as
a minor is worse than an unreleased breaking change, because it will be picked up
automatically.

| Change | Required bump |
| --- | --- |
| Removing or renaming anything public | **major** |
| Narrowing a type, adding a required field | **major** |
| Changing a default, a status code, or an error shape | **major** |
| New endpoint, new optional field, new enum value | minor |
| Behaviour unchanged: docs, internals, performance | patch |

Two rules that are missed most often:

- **A default change is major.** The same request produces a different result;
  that no caller edits their code is exactly why it is dangerous.
- **The version must move in the same PR as the change.** "We'll bump on release"
  means the bump is decided by whoever cuts the release, from a changelog that
  does not mention this.

## Bad

\`\`\`diff
  // package.json
- "version": "2.3.1",
+ "version": "2.4.0",

  // routes/reviews.ts
- const DEFAULT_STRATEGY = 'single-pass';
+ const DEFAULT_STRATEGY = 'map-reduce';
\`\`\`

Every caller that relied on the default now gets a different execution path and a
different cost, delivered by a minor bump.

## Good

\`\`\`diff
- "version": "2.3.1",
+ "version": "3.0.0",
\`\`\`

…with the change listed under a **Breaking** heading in the changelog.

## What to say

State the bump the diff requires and why, in one sentence: "changes the default
strategy for existing callers — requires a major, shipped here as a minor".`,
  },
];
