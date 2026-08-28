import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  EvalCaseFromFindingInput,
  EvalCaseInput,
  EvalCasePatch,
  EvalDryRunInput,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';

/**
 * eval module — the product-side eval pipeline (spec 13).
 *   GET  /findings/:id/eval-case-preview → what the editor shows before saving
 *   POST /findings/:id/eval-case   → turn a decided finding into an eval case
 *   GET  /agents/:id/eval-cases    → the agent's cases
 *   GET  /skills/:id/eval-cases    → a skill's cases (read-only; see below)
 *   GET  /eval-dashboard           → every agent + recent runs (R8)
 *
 * Distinct from `evals/` at the repo root, which is a CLI harness over
 * checked-in fixtures with no database. The two share a scoring idea and
 * nothing else.
 *
 * This is the only layer that names status codes.
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);

  app.get('/findings/:id/eval-case-preview', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.previewFromFinding(workspaceId, req.params.id);
  });

  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams, body: EvalCaseFromFindingInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { case: evalCase, created } = await service.createFromFinding(
        workspaceId,
        req.params.id,
        req.body,
      );
      // 200 on the repeat click: the case the caller asked for exists and is
      // returned, so this is not an error the UI needs to explain away.
      reply.code(created ? 201 : 200);
      return { case: evalCase, created };
    },
  );

  /**
   * Run every case in the agent's set (spec 13, R3).
   *
   * One request, one run: the cases go through sequentially and share a single
   * `ran_at`, which is what makes them one row group in the history. Rate
   * limited like the review routes — each case is a model call, so a double
   * click is a doubled bill.
   */
  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams },
      config: { rateLimit: { max: 4, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runSet(workspaceId, req.params.id);
    },
  );

  /**
   * Score one case's input without persisting it (spec 13, R3).
   *
   * The case editor's `Run case`: the draft has no row yet, so there is nothing
   * to write a run against. Same rate limit as the full set — it is the same
   * model call.
   */
  app.post(
    '/agents/:id/eval-runs/preview',
    {
      schema: { params: IdParams, body: EvalDryRunInput },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.dryRun(workspaceId, req.params.id, req.body);
    },
  );

  app.get('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runHistory(workspaceId, req.params.id);
  });

  /** Run one saved case. Same rate limit shape as the set — one model call. */
  app.post(
    '/eval-cases/:id/run',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runCase(workspaceId, req.params.id);
    },
  );

  /** Create a case by hand — the Case Editor's save. */
  app.post('/eval-cases', { schema: { body: EvalCaseInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const created = await service.createCase(workspaceId, req.body);
    reply.code(201);
    return created;
  });

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCasePatch } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.deleteCase(workspaceId, req.params.id);
    reply.code(204);
  });

  app.get('/eval-dashboard', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboard(workspaceId);
  });

  /**
   * What this skill can be judged by: its own cases (rare) plus the sets of
   * every agent that links it.
   *
   * There is deliberately no `POST /skills/:id/eval-runs`: a skill is a body of
   * text, not something that can review a diff. Running a skill's set means
   * running it THROUGH an agent that links it, and which agent that is, is a
   * choice — not something this route can pick for the caller.
   */
  app.get('/skills/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listForSkill(workspaceId, req.params.id);
  });

  app.get('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const cases = await service.listForOwner(workspaceId, 'agent', req.params.id);
    return { cases };
  });
}
