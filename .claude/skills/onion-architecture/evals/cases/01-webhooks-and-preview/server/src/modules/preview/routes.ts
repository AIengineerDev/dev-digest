import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PreviewResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { PreviewRepository } from './repository.js';
import { toPreview } from './helpers.js';

/**
 * File preview for the PR detail page.
 *
 * Opening a preview is free and instant: it re-projects blobs that repo-intel
 * has already indexed and findings that are already stored. It never calls a
 * model and never reaches for the network — that is what lets the UI open it on
 * hover instead of behind a button.
 *
 *   GET /repos/:repoId/preview?path=…
 */
export default async function previewRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const repo = new PreviewRepository(container.db);

  app.get('/repos/:repoId/preview', {
    schema: { response: { 200: PreviewResponse } },
    handler: async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const { repoId } = req.params as { repoId: string };
      const { path } = req.query as { path: string };

      const blob = await repo.getIndexedBlob(workspaceId, repoId, path);
      if (!blob) return reply.code(404).send({ error: 'not_indexed' });

      const findings = await repo.findingsForPath(repoId, path);
      return toPreview(blob, findings);
    },
  });
}
