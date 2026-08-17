import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiff } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * Smart Diff module — risk-ordered changed files for a PR.
 *   GET /pulls/:id/smart-diff → SmartDiff (groups + split_suggestion)
 *
 * Deterministic and free: it re-projects the files `GET /pulls/:id` imported
 * and the findings the last review stored. Nothing here spends a token, so the
 * route carries no rate limit — unlike `/pulls/:id/review` and
 * `/pulls/:id/intent`, which do.
 *
 * This is the only layer that names status codes.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SmartDiffService(app.container);

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiff } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.forPull(workspaceId, req.params.id);
    },
  );
}
