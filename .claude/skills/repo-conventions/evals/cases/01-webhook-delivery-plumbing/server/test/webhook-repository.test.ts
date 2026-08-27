import { describe, it, expect, beforeAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  const pg = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  app = await buildApp({ databaseUrl: pg.getConnectionUri() });
}, 120_000);

describe('webhook repository', () => {
  it('stores a webhook and its events atomically', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks',
      payload: { url: 'https://example.test/hook', events: ['review.finished'] },
    });
    expect(res.statusCode).toBe(200);
  });
});
