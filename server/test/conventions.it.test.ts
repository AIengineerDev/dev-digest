import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { EXTRACTION_SCHEMA_NAME } from '../src/modules/conventions/constants.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * The conventions module over a real Postgres, through the HTTP seam, with the
 * model replaced by a fixture.
 *
 * What is worth pinning here is not that a scan returns rows — it is that the
 * rows it returns are exactly the ones whose evidence survived the code-side
 * gate, that a human verdict outlives a re-scan, and that a rejected rule cannot
 * reach the skill.
 */

const HANDLER_TS = [
  'import { z } from "zod";',
  '',
  'export async function handler(req: Request) {',
  '  const parsed = Schema.safeParse(req.body);',
  '  if (!parsed.success) throw new ValidationError("bad input");',
  '  return ok(parsed.data);',
  '}',
].join('\n');

const PACKAGE_JSON = '{\n  "name": "payments-api",\n  "type": "module"\n}';

/** One real rule, and three that must not survive verification. */
const FIXTURE = {
  conventions: [
    {
      category: 'error-handling',
      rule: 'Route handlers throw ValidationError instead of returning a bare 400.',
      rationale: 'One error taxonomy; the error handler owns status codes.',
      evidence_path: 'src/api/handler.ts',
      // Deliberately wrong: the line is 5. A correctable miss must NOT be fatal.
      evidence_line: 41,
      evidence_snippet: 'if (!parsed.success) throw new ValidationError("bad input");',
      confidence: 0.9,
    },
    {
      category: 'typing',
      rule: 'Every module re-exports its public types from an index barrel.',
      rationale: 'Invented — this path was never sampled.',
      evidence_path: 'src/never/sampled.ts',
      evidence_line: 3,
      evidence_snippet: 'export * from "./types";',
      confidence: 0.95,
    },
    {
      category: 'async',
      rule: 'Handlers wrap every await in a try/catch.',
      rationale: 'Invented — this code is not in the sampled file.',
      evidence_path: 'src/api/handler.ts',
      evidence_line: 4,
      evidence_snippet: 'try { await doTheThing(); } catch (e) { log(e); }',
      confidence: 0.88,
    },
    {
      category: 'naming',
      rule: 'Variables are named in camelCase.',
      rationale: 'True but generic, and the model is unsure.',
      evidence_path: 'src/api/handler.ts',
      evidence_line: 4,
      evidence_snippet: 'const parsed = Schema.safeParse(req.body);',
      confidence: 0.2,
    },
  ],
};

d('conventions module', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** Sampling is code, so the test supplies the two seams it uses: rank + clone. */
  function makeApp(fixture: unknown = FIXTURE) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const repoIntel = {
      getConventionSamples: async () => ['src/api/handler.ts'],
    } as unknown as RepoIntel;
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({
          head: 'deadbeefcafe',
          files: { 'src/api/handler.ts': HANDLER_TS, 'package.json': PACKAGE_JSON },
        }),
        github: new MockGitHubClient(),
        repoIntel,
        llm: {
          openai: new MockLLMProvider('openai', {
            structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: fixture },
          }),
        },
      },
    });
  }

  async function extract(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as {
      sampled_files: string[];
      proposed: number;
      verified: number;
      dropped: number;
      conventions: {
        id: string;
        rule: string;
        status: string;
        evidence_line: number;
        head_sha: string | null;
      }[];
    };
  }

  it('persists only the candidate whose evidence is really in a sampled file', async () => {
    const app = makeApp();
    const out = await extract(await app);

    expect(out.proposed).toBe(4);
    expect(out.verified).toBe(1);
    expect(out.dropped).toBe(3);
    expect(out.conventions).toHaveLength(1);
    expect(out.conventions[0]!.rule).toMatch(/ValidationError/);
  });

  it('corrects the model’s line number instead of dropping the rule', async () => {
    const app = makeApp();
    const out = await extract(await app);
    // Claimed 41; the quote is on line 5.
    expect(out.conventions[0]!.evidence_line).toBe(5);
  });

  it('stamps the head the scan ran against, so the evidence link is a permalink', async () => {
    const app = makeApp();
    const out = await extract(await app);
    expect(out.conventions[0]!.head_sha).toBe('deadbeefcafe');
  });

  it('samples the configs by name as well as the ranked files', async () => {
    const app = makeApp();
    const out = await extract(await app);
    expect(out.sampled_files).toContain('package.json');
    expect(out.sampled_files).toContain('src/api/handler.ts');
  });

  it('keeps a decided verdict across a re-scan and drops the undecided ones', async () => {
    const app = await makeApp();
    const first = await extract(app);
    const id = first.conventions[0]!.id;

    const rejected = await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { status: 'rejected' },
    });
    expect(rejected.statusCode, rejected.body).toBe(200);

    const second = await extract(app);
    // Same rule comes back from the model, but it was already decided: it is not
    // re-proposed as pending, and the rejection is still there.
    const rows = second.conventions.filter((c) => c.id === id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('rejected');
    expect(second.verified).toBe(0);
  });

  it('builds a skill from the accepted set only, tagged as extracted', async () => {
    const app = await makeApp();
    const out = await extract(app);
    // Whatever verdict the previous test left on the one surviving rule, the
    // skill is built from what `status` says now.
    const id = out.conventions[0]!.id;

    await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { status: 'accepted' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'repo-conventions', description: 'House rules for payments-api' },
    });
    expect(res.statusCode, res.body).toBe(201);
    const skill = res.json() as {
      id: string;
      body: string;
      source: string;
      version: number;
      evidence_files: string[];
    };

    expect(skill.source).toBe('extracted');
    expect(skill.version).toBe(1);
    expect(skill.evidence_files).toEqual(['src/api/handler.ts']);
    expect(skill.body).toContain('ValidationError');
    // The rejected rule from the previous test's fixture must not be in there.
    expect(skill.body).not.toContain('camelCase');

    // Created through the same writer as POST /skills, so the v1 snapshot exists.
    const versions = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` });
    expect((versions.json() as unknown[]).length).toBe(1);
  });

  it('refuses to build a skill when nothing has been accepted', async () => {
    const app = await makeApp();
    const other = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'empty-api',
        fullName: 'acme/empty-api',
        defaultBranch: 'main',
      })
      .returning({ id: t.repos.id });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${other[0]!.id}/conventions/skill`,
      payload: { name: 'nothing', description: 'nothing accepted yet' },
    });
    expect(res.statusCode).toBe(422);
  });
});
