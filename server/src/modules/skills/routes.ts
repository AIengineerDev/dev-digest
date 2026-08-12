import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateSkillInput,
  ImportSkillFileInput,
  ImportSkillInput,
  SkillType,
  UpdateSkillInput,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * Skills module — reusable review rules, shared across agents.
 *   GET    /skills                        → list (workspace-scoped; ?type= ?enabled= ?q=)
 *   POST   /skills                        → create (v1 + first snapshot)
 *   POST   /skills/import                 → fetch a body from a URL (untrusted)
 *   POST   /skills/import-file            → store a client-read file (untrusted)
 *   GET    /skills/:id                    → one skill
 *   PUT    /skills/:id                    → update; a body change bumps the version
 *   DELETE /skills/:id                    → hard delete (versions + links cascade)
 *   GET    /skills/:id/versions           → body history (newest first)
 *   GET    /skills/:id/versions/:version  → one body snapshot
 *
 * This is the only layer that names status codes.
 */

/**
 * `?enabled=` arrives as a string. `z.coerce.boolean()` would read "false" as
 * true (any non-empty string is truthy), so the two literals are spelled out.
 */
const ListSkillsQuery = z.object({
  type: SkillType.optional(),
  enabled: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  q: z.string().optional(),
});

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', { schema: { querystring: ListSkillsQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { type, enabled, q } = req.query;
    return service.list(workspaceId, {
      ...(type !== undefined ? { type } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(q !== undefined ? { q } : {}),
    });
  });

  app.post('/skills', { schema: { body: CreateSkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.post('/skills/import', { schema: { body: ImportSkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.importFromUrl(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  // JSON, not multipart: the browser reads the file and posts its text, so the
  // server needs no upload parser and stores no artefact — the body IS the file.
  app.post('/skills/import-file', { schema: { body: ImportSkillFileInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.importFromFile(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillInput } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get('/skills/:id/versions/:version', { schema: { params: VersionParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
    if (!version) throw new NotFoundError('Skill version not found');
    return version;
  });
}
