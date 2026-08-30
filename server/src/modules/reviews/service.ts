import type { Container } from '../../platform/container.js';
import type {
  AgentEstimate,
  FindingActionKind,
  LatestMultiAgentRun,
  MultiAgentRunView,
  RunEventKind,
  RunTrace,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { ReviewRepository } from './repository.js';
import { type ReviewDto, type ReviewDtoFinding, findingRowToDto, selectTargets } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { reviewToDto } from './helpers.js';
import { groupFindings } from './grouping.js';

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. Precedence `agentIds > agentId > all`. The
   * `agentIds` subset path is a multi-agent run (C1); it never throws
   * `NotFoundError` for an unknown/disabled id — it drops that id and runs
   * the rest, 400-ing only when nothing survives (`selectTargets`, pure).
   * The single-`agentId`/`all` paths are unchanged from before this feature.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean; agentIds?: string[] },
  ): Promise<AgentRow[]> {
    if (opts.agentIds && opts.agentIds.length > 0) {
      const [enabled, allAgents] = await Promise.all([
        this.agents.listEnabled(workspaceId),
        this.agents.list(workspaceId),
      ]);
      const byId = new Map(allAgents.map((a) => [a.id, a] as const));
      const { targets } = selectTargets({ agentIds: opts.agentIds }, enabled, byId);
      if (targets.length === 0) {
        throw new AppError('invalid_run_request', 'No valid agents in agentIds', 400);
      }
      return targets;
    }
    if (opts.all) return this.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<{
    runs: { run_id: string; agent_id: string; agent_name: string }[];
    reviews: ReviewDto[];
    multiAgentRunId: string | null;
  }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // More than one target = a multi-agent run: write the group row BEFORE any
    // member run, so every member can be stamped with a real id (R2). No
    // transaction with the member inserts below — see server/INSIGHTS.md: a
    // group row with no members is inert, unlike a member with a dangling id.
    const multiAgentRunId =
      targets.length > 1 ? await this.repo.createMultiAgentRun({ workspaceId, prId }) : null;

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await this.repo.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
        // Stamped at creation, not completion: the run reviews the head as it
        // was when it started, even if the PR is pushed to mid-run.
        headSha: pull.headSha,
        multiAgentRunId,
      });
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [], multiAgentRunId };
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.container.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null),
    );
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(runId);
  }

  /**
   * Compose the multi-agent results view (Phase 5): resolve the group
   * (verifying its pr_id matches the path's PR — a group from another PR is a
   * 404, not a cross-PR read) → its member runs → their reviews → group the
   * findings. The route composes nothing; this is where R3's grouping meets
   * R2's persisted run rows.
   */
  async multiAgentRun(workspaceId: string, prId: string, id: string): Promise<MultiAgentRunView> {
    const group = await this.repo.getMultiAgentRun(workspaceId, id);
    if (!group || group.prId !== prId) throw new NotFoundError('Multi-agent run not found');

    const runs = await this.repo.listRunsForMultiAgentRun(workspaceId, id);
    const runIds = runs.map((r) => r.run_id);
    const reviewRows = await this.repo.reviewsForRunIds(runIds);

    // One entry per member run — including a run whose review never persisted
    // (still executing, or failed before writing one) — so `takes` covers
    // every agent in the run, silent ones included (C3).
    const byRunId = new Map(reviewRows.map((r) => [r.review.runId, r]));
    const perAgent = runs.map((run) => {
      const row = run.run_id ? byRunId.get(run.run_id) : undefined;
      return {
        // Falls back to the run id (never empty, never shared between two
        // runs) when the agent has since been deleted — `agentId` is nullable
        // on `agent_runs` (`on delete set null`) and two such runs must not
        // collapse into one take.
        agent_id: run.agent_id ?? `deleted-agent:${run.run_id}`,
        agent_name: run.agent_name,
        findings: row ? row.findings.map(findingRowToDto) : [],
      };
    });

    const groups = groupFindings(perAgent);
    return { runs, groups };
  }

  /** The repo's most recently started multi-agent run, or null (R8's landing
   *  screen: arriving shows that run's results, not an empty form). */
  async latestMultiAgentRunForRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<LatestMultiAgentRun | null> {
    const row = await this.repo.latestMultiAgentRunForRepo(workspaceId, repoId);
    return row ?? null;
  }

  /** Per-agent median duration/cost over recent runs; null (never 0) with no
   *  history (R9). */
  async agentEstimates(workspaceId: string): Promise<AgentEstimate[]> {
    return this.repo.agentEstimates(workspaceId);
  }
}
