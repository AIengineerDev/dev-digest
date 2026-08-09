import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConventionStatus,
  CreateSkillFromConventionsInput,
  UpdateConventionInput,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — house rules mined from a repo, promoted to skills.
 *   GET    /repos/:id/conventions         → candidates for a repo (?status=)
 *   POST   /repos/:id/conventions/extract → scan; returns the verification counts
 *   PATCH  /conventions/:id               → edit the rule, re-categorise, accept, reject
 *   POST   /repos/:id/conventions/skill   → accepted set → one skill
 *
 * This is the only layer that names status codes.
 */

const ListConventionsQuery = z.object({ status: ConventionStatus.optional() });

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, querystring: ListConventionsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { status } = req.query;
      return service.list(workspaceId, req.params.id, status ? { status } : {});
    },
  );

  /**
   * Synchronous on purpose: a scan is one model call over a dozen files, in the
   * seconds range, and the screen has nothing to show until it finishes. Making
   * it a job would buy a spinner and cost a polling endpoint.
   */
  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.update(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillFromConventionsInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );
}
