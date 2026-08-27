import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { desc, eq } from 'drizzle-orm';
import { WebhookCreate, WebhookList, WebhookDelivery } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { WebhookService } from './service.js';
import { WebhookRepository } from './repository.js';

/**
 * Outbound webhooks: register an endpoint, list what has been delivered to it.
 *   POST   /webhooks
 *   GET    /webhooks
 *   GET    /webhooks/:id/deliveries
 *   DELETE /webhooks/:id
 */
export default async function webhookRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new WebhookService(new WebhookRepository(container.db), container.http);

  app.post('/webhooks', {
    schema: { body: WebhookCreate },
    handler: async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.register(workspaceId, req.body as WebhookCreate);
    },
  });

  app.get('/webhooks', {
    schema: { response: { 200: WebhookList } },
    handler: async (req) => {
      const { workspaceId } = await getContext(container, req);
      const rows = await container.db
        .select()
        .from(t.webhooks)
        .where(eq(t.webhooks.workspaceId, workspaceId))
        .orderBy(desc(t.webhooks.createdAt));
      return { items: rows };
    },
  });

  app.get('/webhooks/:id/deliveries', {
    schema: { response: { 200: WebhookDelivery.array() } },
    handler: async (req) => {
      const { id } = req.params as { id: string };
      return service.deliveries(id);
    },
  });

  app.delete('/webhooks/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      await service.remove(id);
      return reply.code(204).send();
    },
  });
}
