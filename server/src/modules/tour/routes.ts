import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { TourRecord } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RunLogger } from '../../platform/run-logger.js';
import { TourService } from './service.js';

/**
 * Onboarding tour module (specs/12-onboarding-generator.md).
 *   GET  /repos/:id/tour   → cached TourRecord (`null` if none exists yet),
 *                            re-resolved against the current index (R11).
 *   POST /repos/:id/tour   → generate (or return cached, unless `force`).
 *
 * `POST` is rate-limited — it can spend money (R22). `GET` is not: two
 * indexed reads plus one set-membership pass (A5).
 *
 * This is the only layer naming status codes and the rate limit.
 */
const GenerateTourBody = z.object({ force: z.boolean().optional() });

export default async function tourRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new TourService(container);

  // 200 + null when not yet generated — "no tour" is a state, not a 404.
  app.get(
    '/repos/:id/tour',
    { schema: { params: IdParams, response: { 200: TourRecord.nullable() } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/tour',
    {
      schema: { params: IdParams, response: { 200: TourRecord } },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const body = GenerateTourBody.parse(req.body ?? {});
      // Fanned to zero runIds: no run backs a standalone tour generation, but
      // every line still mirrors to stdout via req.log — same shape
      // `POST /pulls/:id/brief` uses (`brief/routes.ts:48-52`).
      const log = new RunLogger(container.runBus, [], req.log, { repoId: req.params.id });
      return service.generate(workspaceId, req.params.id, { force: body.force }, log);
    },
  );
}
