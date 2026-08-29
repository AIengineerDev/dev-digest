import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { DigestsService } from './service.js';

const CreateDigest = z.object({ repoId: z.string().uuid(), window: z.string() });

export async function digestRoutes(app: FastifyInstance, service: DigestsService): Promise<void> {
  app.get('/repos/:repoId/digests', async (req) => {
    const { repoId } = req.params as { repoId: string };
    return service.list(repoId);
  });

  app.post('/digests', async (req, reply) => {
    const input = CreateDigest.parse(req.body);
    return reply.code(201).send(await service.create(input));
  });
}
