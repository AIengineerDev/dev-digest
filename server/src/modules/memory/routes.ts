import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { MemoryEntry } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { MemoryService } from './service.js';

/**
 * memory module — the RAG store, read-only.
 *   GET /memory → what this workspace has learned, newest first.
 */
export default async function memoryRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new MemoryService(app.container);

  app.get('/memory', async (req): Promise<MemoryEntry[]> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });
}
