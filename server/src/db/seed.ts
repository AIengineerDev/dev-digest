import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  API_CONTRACT_AGENT_NAME,
  API_CONTRACT_REVIEWER_PROMPT,
  API_CONTRACT_SKILLS,
} from './seed-api-contract.js';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model,
 * and the skills fixture (`Test Quality Reviewer` + four linked skills).
 *
 * Course lessons populate the other tables (conventions, memory, eval, …) once
 * their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  await seedTestQualityReviewer(db, workspaceId, userId);
  await seedApiContractReviewer(db, workspaceId, userId);

  return { workspaceId, userId };
}

/**
 * Seed fixture for the skills experiment: `API Contract Reviewer`, with three of
 * its four skills attached in order. The fourth, `deprecation-policy`, is
 * deliberately NOT seeded — it lives at
 * `skills/api-contract-reviewer/deprecation-policy.md` and is brought in through
 * `POST /skills/import`, which keeps the import path exercised by a real
 * document rather than by a fixture.
 *
 * Same idempotency and transaction shape as `seedTestQualityReviewer`.
 */
async function seedApiContractReviewer(db: Db, workspaceId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    let [agent] = await tx
      .select()
      .from(t.agents)
      .where(
        and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, API_CONTRACT_AGENT_NAME)),
      );
    if (!agent) {
      [agent] = await tx
        .insert(t.agents)
        .values({
          workspaceId,
          name: API_CONTRACT_AGENT_NAME,
          description: 'Finds changes that break a published API contract, per the linked skills.',
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
          enabled: true,
          version: 1,
          createdBy: userId,
        })
        .returning();
    }
    const agentId = agent!.id;

    for (const [order, s] of API_CONTRACT_SKILLS.entries()) {
      let [skill] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
      if (!skill) {
        [skill] = await tx
          .insert(t.skills)
          .values({
            workspaceId,
            name: s.name,
            description: s.description,
            type: s.type,
            source: 'manual',
            body: s.body,
            enabled: true,
            version: 1,
          })
          .returning();
        await tx.insert(t.skillVersions).values({ skillId: skill!.id, version: 1, body: s.body });
      }

      await tx
        .insert(t.agentSkills)
        .values({ agentId, skillId: skill!.id, order })
        .onConflictDoNothing();
    }
  });
}

/**
 * Seed fixture for the skills feature: one agent, `Test Quality Reviewer`, with
 * the four skills of `specs/02-skills.md` attached in order.
 *
 * This is simultaneously the demo, the e2e fixture, and the worked example of
 * what a good skill body looks like — so the bodies are real guidance, drawn
 * from this repo's own `TESTING.md` doctrine.
 *
 * Idempotent (skills and the agent are matched by workspace + name, links are
 * `onConflictDoNothing`) and fully transactional: skill + v1 snapshot + link
 * either all land or none do.
 */
async function seedTestQualityReviewer(db: Db, workspaceId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    let [agent] = await tx
      .select()
      .from(t.agents)
      .where(
        and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, TEST_QUALITY_AGENT_NAME)),
      );
    if (!agent) {
      [agent] = await tx
        .insert(t.agents)
        .values({
          workspaceId,
          name: TEST_QUALITY_AGENT_NAME,
          description: 'Judges whether a change is tested the right way, per the linked skills.',
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
          enabled: true,
          version: 1,
          createdBy: userId,
        })
        .returning();
    }
    const agentId = agent!.id;

    for (const [order, s] of SEED_SKILLS.entries()) {
      let [skill] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
      if (!skill) {
        [skill] = await tx
          .insert(t.skills)
          .values({
            workspaceId,
            name: s.name,
            description: s.description,
            type: s.type,
            source: 'manual',
            body: s.body,
            enabled: true,
            version: 1,
          })
          .returning();
        await tx
          .insert(t.skillVersions)
          .values({ skillId: skill!.id, version: 1, body: s.body });
      }

      await tx
        .insert(t.agentSkills)
        .values({ agentId, skillId: skill!.id, order })
        .onConflictDoNothing();
    }
  });
}

const TEST_QUALITY_AGENT_NAME = 'Test Quality Reviewer';

const TEST_QUALITY_REVIEWER_PROMPT = `# Role
You review one thing: the quality of the tests in this pull request. Not the
production code's correctness, not its style — whether the change is tested in a
way that would actually catch the class of regression it can cause.

# How to work
Your attached skills carry the specifics: which kinds of tests this repo expects,
what makes an assertion meaningful, where the hermetic boundary sits, and what
counts as a seam worth testing. Apply them in the order they are given — the
broad judgement first, the mechanical checks after — and defer to them wherever
they are more specific than this prompt. If a skill and your own instinct
disagree, the skill wins; it is the house rule.

# Scope
- Comment on test files, and on production changes that are untested and should
  not be.
- Do not report coverage percentages, and do not ask for tests on renames,
  formatting, comments, or type-only changes.
- If the tests in the diff are adequate, say so plainly and report nothing.

# Output
One finding per problem, each naming the file and lines, what the test fails to
prove, and the smallest concrete change that would fix it. Severity reflects the
risk of the untested behaviour, not the size of the test gap.`;

interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention';
  body: string;
}

/**
 * Order is part of the fixture: broad judgement (1, 2) frames the mechanical
 * checks (3, 4). Phase 4's reorder test perturbs exactly this order, which is
 * what makes that assertion meaningful rather than arbitrary.
 */
const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'test-typology',
    description: 'Judge the kind of test a change needs, not how much of it is covered.',
    type: 'rubric',
    body: `# Typological, not exhaustive

Line coverage is not the question. The question is whether this change adds the
*kind* of test that catches the class of regression it can cause. Each suite
covers one happy path plus the edge that actually matters per workflow, and
deliberately skips the rest.

## Ask, in order

1. **What can break here?** A new branch in a data path, a new SQL query, a new
   route, a changed contract, a new adapter — each has a characteristic failure.
   Name it before judging the test.
2. **Would the test in this diff catch that failure?** If the answer is no, the
   test is decoration regardless of how many lines it touches.
3. **Is it at the right level?** Logic that is pure belongs in a hermetic unit
   test. Anything whose bugs live in SQL, migrations, or wiring needs one real
   integration test against a real Postgres — a mocked DB proves nothing about
   either. A user journey needs a browser flow on seeded data.

## Worth a finding

- A new branch in a data path with no test that takes it.
- New SQL, a new migration, or new route wiring with only unit tests around it.
- A new contract or response shape that nothing parses in a test.
- A bug fix with no test that fails before the fix. Regression tests are the one
  case where the test is the whole point of the change.

## Not worth a finding

- Renames, moves, formatting, comments, type-only changes.
- A second test for a branch that is already covered by kind.
- Anything whose only justification is raising a coverage number.

If a test would not catch a class of regression we care about, do not ask for
it. Asking for tests that cannot fail is how suites become expensive noise.`,
  },
  {
    name: 'assertions-that-can-fail',
    description: 'A test that still passes with the change reverted proves nothing.',
    type: 'convention',
    body: `# The assertion must be able to fail

The single most useful check on a test: **would it still pass if the change it
tests were reverted?** If yes, it proves nothing, and it is worse than no test
because it reports safety that does not exist.

Apply this mentally to every new or modified test in the diff. Read the
assertion, imagine the production change undone, and ask whether the assertion
would notice.

## Failure modes to flag by name

- **Vacuous assertions.** \`expect(x).toBeDefined()\`, \`toBeTruthy()\`,
  \`not.toThrow()\` on a value that was never in danger of being undefined,
  falsy, or throwing. State the expected value instead.
- **Snapshots of nothing.** A snapshot over an empty render, a stub's output, or
  a structure the change cannot affect. A snapshot that nobody would read when it
  breaks is a rubber stamp with extra steps.
- **Mocks asserting themselves.** The test stubs a function to return \`42\`,
  then asserts the result is \`42\`. The only thing proven is that the mocking
  library works. Assert on what the code *did with* the stub — the arguments it
  passed, the branch it took, the shape it built.
- **Assertions on the arrangement.** Checking the fixture the test just wrote,
  rather than the output of the code under test.
- **Try/catch that swallows.** A \`catch\` with no \`expect.fail()\` after it
  turns a thrown error into a pass.
- **Missing await.** An un-awaited async assertion resolves after the test ends
  and can never fail it.

## The rollback test lesson

A test that claims to prove a transaction rolls back is only proven once the
transaction is temporarily removed and the test is watched to fail. That is the
standard for any test asserting an invariant it cannot directly observe: if you
did not see it go red, you do not know it can.`,
  },
  {
    name: 'hermetic-boundaries',
    description: 'Only *.it.test.ts may touch the real world; everything else is hermetic.',
    type: 'convention',
    body: `# Hermetic by default

Server tests split by filename, and the filename is the contract:

- **\`*.it.test.ts\`** — integration. May start a real Postgres (pgvector, via
  testcontainers), run migrations, seed, and drive routes end to end. These are
  selected by \`vitest run .it.test\` and gated on Docker.
- **Everything else** — hermetic. No network, no real clock, no filesystem
  writes outside a temp dir, no database. Selected by
  \`vitest run --exclude '**/*.it.test.ts'\`, and it runs where Docker does not.

A DB-backed test that imports \`test/helpers/pg.ts\` **must** carry the
\`.it.test.ts\` suffix. Without it the test lands in the hermetic lane and breaks
CI on a machine with no Docker daemon — a failure that looks like flake and is
not.

## Flag, in a non-\`.it.test.ts\` file

- \`fetch\`, \`http\`, \`octokit\`, or any real HTTP client without a stub.
- A real database handle, a real connection string, or an import of the pg
  helper.
- \`new Date()\` / \`Date.now()\` used in an assertion instead of a fixed clock.
- Real \`git\` execution, or reads and writes outside a temp directory.
- A real API key read from the environment. Hermetic tests are key-free; a test
  that needs a secret is in the wrong lane.

## The seam

The outside world is stubbed at \`src/adapters/mocks.ts\` — \`MockLLMProvider\`,
\`MockGitClient\` — and swapped in through the DI container. Point at that seam
in the suggestion rather than asking for ad-hoc module mocking; a test that
reaches for \`vi.mock\` on a module the container already abstracts is fighting
the architecture.

The e2e flows are deterministic too: seeded data, no LLM in the loop, and no
AI-driven browser commands.`,
  },
  {
    name: 'seam-not-internals',
    description: 'Test at routes, adapters, contracts and rendered output — not private helpers.',
    type: 'rubric',
    body: `# Test at the seams

A seam is a boundary someone else depends on: an HTTP route, an adapter port, a
Zod contract, a rendered component, the review pipeline's input and output.
Behaviour at a seam is a promise. Everything inside is an implementation detail
you are allowed to change.

Tests aimed at internals invert the value of a test suite. They pass while the
behaviour is broken and fail while the behaviour is fine, so they get deleted or
ignored — and the ones that get ignored are the ones nobody trusts when they
matter.

## The refactor question

For each test in the diff: **would a pure refactor break it?** Rename a private
helper, inline it, split a component in two, reorder a repository's queries with
the same result. If the test goes red with no behaviour change, it is a liability
and should be rewritten one level up.

## Prefer

- Driving a route through the built app rather than calling the handler.
- Asserting on what a repository *stored*, via a read, rather than on the SQL it
  emitted.
- Rendering a component and interacting with it as a user would — visible text,
  roles, clicks — rather than reading its state or props.
- Asserting a payload parses against the shared contract, rather than checking
  field by field.
- Swapping an adapter at the port and asserting the caller's observable result.

## Flag

- A test importing a symbol that is not part of the module's public surface, or
  reaching through an object to a private field.
- Assertions on call counts of internal functions where the outcome is what
  matters.
- Component tests asserting on class names, CSS-in-JS output, or internal
  hook state.
- Tests that mirror the implementation's structure line for line — the giveaway
  is that reading the test tells you nothing about what the feature is for.

The exception is a genuinely tricky pure function: an algorithm, a parser, a
budget calculation. Those are worth testing directly, because the seam above them
cannot exercise their edges cheaply. Test them as units, and keep them pure.`,
  },
];

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
