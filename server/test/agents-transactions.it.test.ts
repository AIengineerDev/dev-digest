import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-transactions] Docker not available — skipping integration tests.');
}

/**
 * Atomicity of the agents repository's multi-write operations.
 *
 * These pin behaviour that is invisible on the happy path: every assertion here
 * passes with or without a transaction *unless* something fails midway. They
 * exist because before 2026-08-09 the server used no transactions at all, so an
 * interrupted write left an agent with no initial version, or an agent whose
 * skills had been deleted but not re-inserted.
 */
d('agents repository — transactional writes', () => {
  let pg: PgFixture;
  let repo: AgentsRepository;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    repo = new AgentsRepository(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newAgent(name: string) {
    return repo.insert({
      workspaceId,
      name,
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'you review code',
    });
  }

  it('insert writes the agent and its v1 snapshot together', async () => {
    const agent = await newAgent('tx-insert');

    const versions = await pg.handle.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agent.id));

    expect(versions).toHaveLength(1);
    expect(versions[0]!.version).toBe(1);
  });

  it('setSkills rolls back completely when the new links are invalid', async () => {
    const agent = await newAgent('tx-skills');
    // The seed writes no skills (an empty table is expected here), so make one.
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'tx-fixture-skill',
        description: 'fixture',
        type: 'convention',
        source: 'manual',
        body: 'prefer named exports',
      })
      .returning();
    expect(skill).toBeDefined();

    await repo.setSkills(agent.id, [skill!.id]);
    expect(await repo.skillIdsForAgent(agent.id)).toEqual([skill!.id]);

    // A skill id that does not exist violates the FK on agent_skills. The
    // delete has already run inside the transaction at that point, so without
    // a rollback the agent would end up with no skills at all.
    await expect(
      repo.setSkills(agent.id, ['00000000-0000-0000-0000-000000000000']),
    ).rejects.toThrow();

    expect(
      await repo.skillIdsForAgent(agent.id),
      'the previous skill links must survive a failed replace',
    ).toEqual([skill!.id]);
  });

  it('a config update appends exactly one new version', async () => {
    const agent = await newAgent('tx-update');
    await repo.update(workspaceId, agent.id, { model: 'gpt-4o' });

    const versions = await pg.handle.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agent.id));

    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });
});
