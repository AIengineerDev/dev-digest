import type { FastifyInstance } from 'fastify';
import { FindingListQuery, FindingListResponse } from '../contracts/findings.js';
import type { FindingStore } from '../store.js';

export async function findingRoutes(app: FastifyInstance, store: FindingStore): Promise<void> {
  app.get('/repos/:repoId/pulls/:number/findings', {
    schema: { querystring: FindingListQuery, response: { 200: FindingListResponse } },
    handler: async (req) => {
      const { repoId, number } = req.params as { repoId: string; number: string };
      const q = req.query as FindingListQuery;
      const page = await store.listFindings(repoId, Number(number), {
        severity: q.severity,
        cursor: q.cursor,
      });
      return {
        items: page.rows,
        next_cursor: page.nextCursor,
      };
    },
  });
}
