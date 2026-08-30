import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CiExportInput, type CiExport, type CiInstallation } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';

/**
 * ci module — Export to CI (spec 15).
 *   POST /agents/:id/export-ci        → generate (`action: 'files'`) or
 *                                        install (`action: 'open_pr'`) — one
 *                                        route serves both, which is how R3
 *                                        is satisfied without the client
 *                                        sending bytes back.
 *   GET  /agents/:id/ci-installations → this agent's exports
 *
 * This is the only layer naming a status code; every domain failure below
 * throws an `AppError` subclass that the app-wide error handler
 * (`src/app.ts`) already translates to its `statusCode`.
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req): Promise<CiExport | { files: CiExport['files'] }> => {
      const { workspaceId } = await getContext(app.container, req);

      if (req.body.action === 'files') {
        const { files } = await service.generate(workspaceId, req.params.id, req.body);
        return { files };
      }

      return service.install(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/ci-installations',
    { schema: { params: IdParams } },
    async (req): Promise<CiInstallation[]> => {
      await getContext(app.container, req);
      return service.listInstallations(req.params.id);
    },
  );
}
