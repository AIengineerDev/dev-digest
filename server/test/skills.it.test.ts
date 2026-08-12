import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { MAX_SKILL_BODY_CHARS } from '../src/modules/skills/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * The skills module over a real Postgres, through the HTTP seam.
 *
 * The statements worth pinning are the ones a green happy path hides: which
 * edits append a version and which do not, and that a create/update spanning
 * `skills` + `skill_versions` leaves nothing behind when the second write fails.
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'hermetic-boundaries',
    description: 'Where the real Postgres is allowed',
    type: 'convention' as const,
    body: '*.it.test.ts may use the real Postgres; every other server test must be hermetic.',
  };

  async function createSkill(app: Awaited<ReturnType<typeof makeApp>>, overrides = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, ...overrides },
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json() as { id: string; version: number; body: string; name: string };
  }

  it('create writes the skill at v1 and its first snapshot together', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'create-v1' });

    expect(skill.version).toBe(1);

    const versions = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` });
    expect(versions.statusCode).toBe(200);
    expect(versions.json()).toEqual([
      expect.objectContaining({ skill_id: skill.id, version: 1, body: createBody.body }),
    ]);
  });

  it('a body edit bumps the version and appends a snapshot; history is newest first', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'edit-body' });

    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'Flag network, real clock, filesystem or DB access outside that suffix.' },
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json().version).toBe(2);

    const versions = (await app.inject({
      method: 'GET',
      url: `/skills/${skill.id}/versions`,
    })).json() as Array<{ version: number; body: string }>;

    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0]!.body).toBe(
      'Flag network, real clock, filesystem or DB access outside that suffix.',
    );
    // v1 keeps the text it was written with — snapshots are immutable.
    expect(versions[1]!.body).toBe(createBody.body);

    const one = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/1` });
    expect(one.statusCode).toBe(200);
    expect(one.json().body).toBe(createBody.body);
  });

  it('a name/description/enabled-only edit does not bump the version', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'rename-only' });

    const renamed = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { name: 'renamed', description: 'new words', enabled: false },
    });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect(renamed.json()).toMatchObject({ name: 'renamed', enabled: false, version: 1 });

    const versions = (await app.inject({
      method: 'GET',
      url: `/skills/${skill.id}/versions`,
    })).json() as unknown[];
    expect(versions, 'a rename must not append a snapshot').toHaveLength(1);
  });

  it('re-sending the same body does not append a snapshot', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'idempotent-save' });

    const resaved = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { name: 'idempotent-save', body: createBody.body },
    });
    expect(resaved.statusCode, resaved.body).toBe(200);
    expect(resaved.json().version).toBe(1);

    const versions = (await app.inject({
      method: 'GET',
      url: `/skills/${skill.id}/versions`,
    })).json() as unknown[];
    expect(versions).toHaveLength(1);
  });

  it('rejects an over-limit body on create and on update, naming the limit', async () => {
    const app = await makeApp();
    const tooLong = 'x'.repeat(MAX_SKILL_BODY_CHARS + 1);

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name: 'too-long', body: tooLong },
    });
    expect(created.statusCode).toBe(422);
    expect(created.json().error.message).toContain(String(MAX_SKILL_BODY_CHARS));

    // Nothing was written.
    const list = (await app.inject({ method: 'GET', url: '/skills?q=too-long' })).json();
    expect(list).toEqual([]);

    const skill = await createSkill(app, { name: 'limit-on-update' });
    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: tooLong },
    });
    expect(updated.statusCode).toBe(422);
    expect(updated.json().error.message).toContain(String(MAX_SKILL_BODY_CHARS));

    const after = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(after.json()).toMatchObject({ version: 1, body: createBody.body });
  });

  it('a failed snapshot write rolls the whole update back', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'rollback' });

    // Occupy (skill_id, version=2) so the update's snapshot insert violates the
    // composite primary key. The `skills` UPDATE has already run inside the
    // transaction at that point: without a rollback the row would end up at
    // version 2 with the new body and a snapshot that says something else.
    await pg.handle.db
      .insert(t.skillVersions)
      .values({ skillId: skill.id, version: 2, body: 'squatter' });

    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'a body that must never be persisted' },
    });
    expect(res.statusCode).toBe(422);

    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    expect(row!.version, 'the version bump must be rolled back').toBe(1);
    expect(row!.body, 'the new body must be rolled back').toBe(createBody.body);

    const [squatter] = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skill.id), eq(t.skillVersions.version, 2)));
    expect(squatter!.body, 'the pre-existing v2 row must be untouched').toBe('squatter');
  });

  it('lists with ?type= ?enabled= ?q= and 404s on unknown ids', async () => {
    const app = await makeApp();
    const rubric = await createSkill(app, {
      name: 'filter-rubric',
      type: 'rubric',
      description: 'judging the kind of test',
    });
    await createSkill(app, { name: 'filter-security', type: 'security', enabled: false });

    const byType = (await app.inject({ method: 'GET', url: '/skills?type=rubric' })).json() as
      Array<{ id: string; type: string }>;
    expect(byType.map((s) => s.type)).toEqual(byType.map(() => 'rubric'));
    expect(byType.some((s) => s.id === rubric.id)).toBe(true);

    const disabled = (await app.inject({ method: 'GET', url: '/skills?enabled=false' })).json() as
      Array<{ name: string; enabled: boolean }>;
    expect(disabled.every((s) => s.enabled === false), '?enabled=false must not read as true').toBe(
      true,
    );
    expect(disabled.map((s) => s.name)).toContain('filter-security');

    const byQuery = (await app.inject({ method: 'GET', url: '/skills?q=filter-rubric' })).json() as
      Array<{ id: string }>;
    expect(byQuery.map((s) => s.id)).toEqual([rubric.id]);

    const missing = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${missing}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${missing}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${rubric.id}/versions/99` })).statusCode,
    ).toBe(404);
  });

  it('delete removes the skill, its versions and its agent links', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { name: 'deletable' });

    const agent = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'skill-owner',
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    expect(agent.statusCode).toBe(201);
    const agentId = agent.json().id as string;

    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skill.id] },
    });
    expect(linked.statusCode, linked.body).toBe(200);

    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(deleted.statusCode).toBe(200);

    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(versions, 'versions cascade').toEqual([]);

    const links = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(links, 'agent links cascade').toEqual([]);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(
      404,
    );
  });
});
