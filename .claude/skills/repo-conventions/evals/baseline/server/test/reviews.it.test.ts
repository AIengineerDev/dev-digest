import { describe, it, expect, beforeAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { buildApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  const pg = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  app = await buildApp({ databaseUrl: pg.getConnectionUri() });
}, 120_000);

describe('reviews', () => {
  it('lists reviews for a pull request', async () => {
    const res = await app.inject({ method: 'GET', url: '/pulls/1/reviews' });
    expect(res.statusCode).toBe(200);
  });
});
