import type { FastifyInstance } from 'fastify';
import {
  PrListQuery,
  PrListResponse,
  PrReviewerListResponse,
  PrSummary,
} from '../contracts/pulls.js';
import type { PullStore } from '../store.js';

const DEFAULT_LIMIT = 20;

export async function pullRoutes(app: FastifyInstance, store: PullStore): Promise<void> {
  app.get('/repos/:repoId/pulls', {
    schema: { querystring: PrListQuery, response: { 200: PrListResponse } },
    handler: async (req) => {
      const { repoId } = req.params as { repoId: string };
      const q = req.query as PrListQuery;
      const page = await store.listPulls(repoId, {
        state: q.state,
        cursor: q.cursor,
        limit: q.limit ?? DEFAULT_LIMIT,
      });
      return {
        items: page.rows.map(toSummary),
        next_cursor: page.nextCursor,
      };
    },
  });

  app.get('/repos/:repoId/pulls/:number', {
    schema: { response: { 200: PrSummary } },
    handler: async (req, reply) => {
      const { repoId, number } = req.params as { repoId: string; number: string };
      const row = await store.getPull(repoId, Number(number));
      if (!row) return reply.code(404).send({ error: 'pull_not_found' });
      return toSummary(row);
    },
  });
  app.get('/repos/:repoId/pulls/:number/reviewers', {
    schema: { response: { 200: PrReviewerListResponse } },
    handler: async (req) => {
      const { repoId, number } = req.params as { repoId: string; number: string };
      const rows = await store.listReviewers(repoId, Number(number));
      return { items: rows };
    },
  });
}

function toSummary(row: Awaited<ReturnType<PullStore['getPull']>> & {}): PrSummary {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    state: row.state,
    head_sha: row.headSha,
    last_reviewed_sha: row.lastReviewedSha,
    additions: row.additions,
    deletions: row.deletions,
    updated_at: row.updatedAt.toISOString(),
    draft: row.draft,
  };
}
