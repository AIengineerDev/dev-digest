import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { RunRequest, PrIntentRecord } from '@devdigest/shared';
import type { RunEvent } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { RunLogger } from '../../platform/run-logger.js';
import { ReviewService } from './service.js';
import { IntentService } from './intent-service.js';

/**
 * reviews module.
 *   POST   /pulls/:id/review  {agentId} | {all:true}  → run review(s); returns runs
 *   GET    /runs/:id/events                            → SSE stream of RunEvent (replay-first)
 *   GET    /runs/:id/trace                             → the single-document RunTrace
 *   GET    /pulls/:id/reviews                          → persisted reviews + findings for a PR
 *   GET    /pulls/:id/multi-agent-runs/:multiAgentRunId → a group's runs + FindingGroup[] (R2/R3)
 *   GET    /repos/:id/multi-agent-runs/latest           → the repo's most recent group, or null (R8)
 *   GET    /agents/estimates                             → per-agent median duration/cost (R9)
 *   GET    /pulls/:id/intent                            → derived intent (null if not yet derived)
 *   POST   /pulls/:id/intent                            → (re-)derive intent
 *   POST   /findings/:id/(accept|dismiss)              → finding actions
 */
const FINDING_ACTIONS = ['accept', 'dismiss'] as const;
const DeriveIntentBody = z.object({ force: z.boolean().optional() });
const MultiAgentRunParams = z.object({ id: z.string().uuid(), multiAgentRunId: z.string().uuid() });
export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ReviewService(container);
  const intentService = new IntentService(container, container.reviewRepo);

  // ---- Run a review (manual trigger) -------------------------------
  // Tight per-route limit: each call can fan out to expensive LLM runs.
  // Body stays a tolerant manual parse (both fields optional; empty body is OK).
  app.post(
    '/pulls/:id/review',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
    const { workspaceId } = await getContext(container, req);
    const body = RunRequest.parse(req.body ?? {});
    const targets = await service.resolveTargets(workspaceId, {
      ...(body.agentId !== undefined ? { agentId: body.agentId } : {}),
      ...(body.all !== undefined ? { all: body.all } : {}),
      ...(body.agentIds !== undefined ? { agentIds: body.agentIds } : {}),
    });
    const { runs, reviews, multiAgentRunId } = await service.runReview(
      workspaceId,
      req.params.id,
      targets,
      req.log,
    );
    return { pr_id: req.params.id, runs, reviews, multi_agent_run_id: multiAgentRunId };
  });

  // ---- SSE: live run events (replay buffer first, then live; ends on done) -
  // No rate limit: SSE is one long-lived connection, not burst traffic.
  app.get(
    '/runs/:id/events',
    { schema: { params: IdParams }, config: { rateLimit: false } },
    async (req, reply) => {
    await getContext(container, req);
    const runId = req.params.id;

    reply.sse(
      (async function* () {
        // Bridge the in-memory RunBus to an async iterator the SSE plugin drains.
        const queue: RunEvent[] = [];
        let resolve: (() => void) | null = null;
        let done = false;

        const unsubscribe = container.runBus.subscribe(runId, (e) => {
          queue.push(e);
          resolve?.();
        });
        const offDone = container.runBus.onDone(runId, () => {
          done = true;
          resolve?.();
        });

        try {
          while (true) {
            if (queue.length === 0) {
              if (done) break;
              await new Promise<void>((r) => (resolve = r));
              resolve = null;
              continue;
            }
            const e = queue.shift()!;
            yield {
              id: String(e.seq),
              event: e.kind,
              data: JSON.stringify(e),
            };
          }
        } finally {
          unsubscribe();
          offDone();
        }
      })(),
    );
  });

  // ---- Active (in-flight) runs for a PR (server source of truth) ----------
  app.get('/pulls/:id/runs/active', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.activeRuns(workspaceId, req.params.id);
  });

  // ---- All runs for a PR (any status; the run history, incl. failures) -----
  app.get('/pulls/:id/runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId, req.params.id);
  });

  // ---- A multi-agent run's results: member runs + grouped findings --------
  app.get(
    '/pulls/:id/multi-agent-runs/:multiAgentRunId',
    { schema: { params: MultiAgentRunParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.multiAgentRun(workspaceId, req.params.id, req.params.multiAgentRunId);
    },
  );

  // ---- The repo's most recent multi-agent run (R8's landing screen) -------
  app.get('/repos/:id/multi-agent-runs/latest', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.latestMultiAgentRunForRepo(workspaceId, req.params.id);
  });

  // ---- Per-agent median duration/cost, for the picker's estimate (R9) -----
  app.get('/agents/estimates', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.agentEstimates(workspaceId);
  });

  // ---- Delete one run from the history (+ its trace) ----------------------
  app.delete('/runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteRun(workspaceId, req.params.id);
    return { ok };
  });

  // ---- Cancel an in-flight run --------------------------------------------
  app.post('/runs/:id/cancel', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    await service.cancelRun(req.params.id);
    return { ok: true };
  });

  // ---- Run trace (single document; A5 enriches with multi-agent/stats) ----
  app.get('/runs/:id/trace', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    const trace = await service.getRunTrace(req.params.id);
    if (!trace) throw new NotFoundError('Run trace not found');
    return trace;
  });

  // ---- Reads --------------------------------------------------------------
  app.get('/pulls/:id/reviews', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.reviewsForPull(workspaceId, req.params.id);
  });

  // ---- Derived intent (specs/04-intent-layer.md) ---------------------------
  // 200 + null when not yet derived — "no intent" is a state, not a 404.
  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentRecord.nullable() } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return intentService.get(workspaceId, req.params.id);
    },
  );

  // Rate limit matches /pulls/:id/review — it spends money too.
  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, response: { 200: PrIntentRecord.nullable() } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const body = DeriveIntentBody.parse(req.body ?? {});
      // Fanned to zero runIds: no SSE stream (there is no run here), but every
      // line still mirrors to stdout via req.log — same RunLogger the wire uses.
      const log = new RunLogger(container.runBus, [], req.log, { prId: req.params.id });
      return intentService.derive(workspaceId, req.params.id, { force: body.force }, log);
    },
  );

  // ---- Delete a whole review run (one agent's pass) + its findings --------
  app.delete('/reviews/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteReview(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Review not found');
    return { ok: true };
  });

  // ---- Finding actions (accept / dismiss) ---------------------------------
  for (const action of FINDING_ACTIONS) {
    app.post(`/findings/:id/${action}`, { schema: { params: IdParams } }, async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.actOnFinding(workspaceId, req.params.id, action);
      return result;
    });
  }
}
