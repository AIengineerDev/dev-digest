import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { alerts } from '../../db/schema.js';
import { AlertsService } from './service.js';

const CreateAlert = z.object({
  repoId: z.string().uuid(),
  channel: z.enum(['email', 'slack']),
  body: z.string().min(1),
});

export async function alertRoutes(app: FastifyInstance, service: AlertsService): Promise<void> {
  app.post('/repos/:repoId/alerts', async (req, reply) => {
    const input = CreateAlert.parse(req.body);
    const created = await service.raise(input);
    return reply.code(201).send(created);
  });

  app.get('/repos/:repoId/alerts', async (req) => {
    const { repoId } = req.params as { repoId: string };
    return app.db.select().from(alerts).where(eq(alerts.repoId, repoId));
  });

  app.post('/alerts/:id/resend', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await app.db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
    if (!row.length) return reply.code(404).send({ message: 'no such alert' });
    await service.resend(id);
    return reply.code(202).send({ ok: true });
  });
}
