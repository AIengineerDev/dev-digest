import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ProjectContextService } from './service.js';

/**
 * Project Context module (specs/09-project-context.md).
 *
 *   GET  /repos/:id/context             → ProjectContextList (R1, R3, R3a, D4)
 *   GET  /repos/:id/context/doc?path=…  → ProjectContextDocDetail (R2)
 *   PUT  /repos/:id/context/attachments → replace one document's attachment
 *                                          set (R2, C9)
 *
 * Rescan reuses the existing `POST /repos/:id/resync` (repo-intel module) —
 * no new job kind here (R9, plan A6): this list is stateless and re-reads the
 * clone on every request, so a resync followed by a refetch IS the rescan.
 */

const GetDocQuery = z.object({ path: z.string().min(1) });

const SetAttachmentsBody = z.object({
  path: z.string().min(1),
  targets: z.array(
    z.object({
      target_kind: z.enum(['agent', 'skill']),
      target_id: z.string().uuid(),
    }),
  ),
});

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ProjectContextService(app.container);

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listDocuments(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/context/doc',
    { schema: { params: IdParams, querystring: GetDocQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getDocument(workspaceId, req.params.id, req.query.path);
    },
  );

  app.put(
    '/repos/:id/context/attachments',
    { schema: { params: IdParams, body: SetAttachmentsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const attachments = await service.setAttachments(
        workspaceId,
        req.params.id,
        req.body.path,
        req.body.targets.map((t) => ({ targetKind: t.target_kind, targetId: t.target_id })),
      );
      return { attachments };
    },
  );
}
