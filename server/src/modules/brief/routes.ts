import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BriefRecord } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RunLogger } from '../../platform/run-logger.js';
import { BriefService } from './service.js';

/**
 * PR Brief module (specs/10-pr-brief.md).
 *   GET  /pulls/:id/brief   → cached BriefRecord (`null` if none exists yet)
 *   POST /pulls/:id/brief   → generate (or return cached, unless `force`)
 *
 * `POST` is rate-limited exactly like `/pulls/:id/review` and
 * `/pulls/:id/intent` — it spends money too (R15). `GET` is not: it is two
 * indexed reads.
 *
 * This is the only layer naming status codes and the rate limit.
 */
const GenerateBriefBody = z.object({ force: z.boolean().optional() });

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BriefService(container);

  // 200 + null when not yet generated — "no brief" is a state, not a 404.
  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: BriefRecord.nullable() } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: BriefRecord } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const body = GenerateBriefBody.parse(req.body ?? {});
      // Fanned to zero runIds: no run backs a standalone brief generation, but
      // every line still mirrors to stdout via req.log — the same shape
      // `POST /pulls/:id/intent` uses (`reviews/routes.ts:161-165`).
      const log = new RunLogger(container.runBus, [], req.log, { prId: req.params.id });
      return service.generate(workspaceId, req.params.id, { force: body.force }, log);
    },
  );
}
