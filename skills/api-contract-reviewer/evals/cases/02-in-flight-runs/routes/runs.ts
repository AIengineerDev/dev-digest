import type { FastifyInstance } from 'fastify';
import { RunListResponse, RunSummary } from '../contracts/runs.js';
import type { RunStore } from '../store.js';

const DEFAULT_LIMIT = 20;

export async function runRoutes(app: FastifyInstance, store: RunStore): Promise<void> {
  app.get('/repos/:repoId/runs', {
    schema: { response: { 200: RunListResponse } },
    handler: async (req) => {
      const { repoId } = req.params as { repoId: string };
      const q = req.query as { cursor?: string; limit?: string };
      const page = await store.listRuns(repoId, {
        cursor: q.cursor,
        limit: q.limit ? Number(q.limit) : DEFAULT_LIMIT,
      });
      return {
        items: page.rows.map(toSummary),
        next_cursor: page.nextCursor,
      };
    },
  });
}

function toSummary(row: Awaited<ReturnType<RunStore['getRun']>> & {}): RunSummary {
  return {
    id: row.id,
    pr_id: row.prId,
    agent_name: row.agentName,
    status: row.status === 'queued' ? 'running' : row.status,
    cost_usd: row.costUsd,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}
