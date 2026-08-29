import type {
  AgentPerformance,
  AgentPerformanceRow,
  CostBasis,
  CostSlice,
} from '@devdigest/shared';
import {
  AgentPerformanceRepository,
  MIN_DECISIONS_FOR_RATE,
  type AgentDecisionAggregate,
  type AgentRunAggregate,
  type PerfWindow,
} from './performance.repository.js';

/**
 * A2 — agent performance.
 *
 * Assembles the one shape both the global dashboard and a single agent's Stats
 * read. The composition is here rather than in the route so the two endpoints
 * cannot drift into two different definitions of "accept rate".
 *
 * Read-only by construction: the repository issues selects and nothing else.
 */
export class AgentPerformanceService {
  private readonly repo: AgentPerformanceRepository;

  constructor(deps: { db: ConstructorParameters<typeof AgentPerformanceRepository>[0] }) {
    this.repo = new AgentPerformanceRepository(deps.db);
  }

  async overview(w: PerfWindow): Promise<AgentPerformance> {
    const [runs, decisions, byModel] = await Promise.all([
      this.repo.runsByAgent(w),
      this.repo.decisionsByAgent(w),
      this.repo.costByModel(w),
    ]);

    const decisionsById = new Map(decisions.map((d) => [d.agentId, d]));
    const rows = runs
      .filter((r) => r.agentId !== null)
      .map((r) => toRow(r, decisionsById.get(r.agentId as string)))
      .sort((a, b) => b.runs - a.runs || a.agent_name.localeCompare(b.agent_name));

    /* The breakdowns must sum to the total exactly. They do because all three
       come from the same counted runs — a total computed separately from the
       slices is a total that drifts. */
    const costByAgent: CostSlice[] = rows
      .filter((r) => r.total_cost_usd !== null && r.total_cost_usd > 0)
      .map((r) => ({ label: r.agent_name, cost_usd: r.total_cost_usd as number, runs: r.counted_runs }))
      .sort((a, b) => b.cost_usd - a.cost_usd);

    const costByModel: CostSlice[] = byModel
      .filter((m) => m.costUsd > 0)
      .map((m) => ({ label: m.model ?? 'unknown', cost_usd: m.costUsd, runs: m.runs }))
      .sort((a, b) => b.cost_usd - a.cost_usd);

    const totalCost = round(costByAgent.reduce((s, c) => s + c.cost_usd, 0));

    /* Weighted by decisions, not a mean of means: an agent with three decisions
       must not move the headline as much as one with three hundred. */
    const totalDecided = rows.reduce((s, r) => s + r.decided, 0);
    const totalAccepted = rows.reduce((s, r) => s + r.accepted, 0);
    const avgAcceptRate = totalDecided > 0 ? round(totalAccepted / totalDecided, 4) : null;

    // rows is sorted by runs desc, so the head is the most active. Null when
    // nothing ran: an empty dashboard and a dashboard whose top agent has zero
    // runs are different states and must not collapse into the same one.
    const top = rows[0];
    const mostActive =
      top && top.runs > 0
        ? { agent_id: top.agent_id, agent_name: top.agent_name, runs: top.runs, accept_rate: top.accept_rate }
        : null;

    return {
      period: { from: w.from.toISOString(), to: w.to.toISOString() },
      total_runs: rows.reduce((s, r) => s + r.runs, 0),
      counted_runs: rows.reduce((s, r) => s + r.counted_runs, 0),
      total_cost_usd: totalCost,
      cost_basis: basisFor(rows),
      avg_accept_rate: avgAcceptRate,
      total_decided: totalDecided,
      most_active: mostActive,
      rows,
      cost_by_agent: costByAgent,
      cost_by_model: costByModel,
      excluded: {
        no_cost: runs.reduce((s, r) => s + r.noCost, 0),
        failed: runs.reduce((s, r) => s + r.failed, 0),
      },
      min_decisions_for_rate: MIN_DECISIONS_FOR_RATE,
    };
  }

  /** One agent over the same window, using the same aggregation. */
  async forAgent(w: PerfWindow, agentId: string): Promise<AgentPerformanceRow | null> {
    const all = await this.overview(w);
    return all.rows.find((r) => r.agent_id === agentId) ?? null;
  }
}

function toRow(run: AgentRunAggregate, dec: AgentDecisionAggregate | undefined): AgentPerformanceRow {
  const decided = dec?.decided ?? 0;
  const accepted = dec?.accepted ?? 0;

  return {
    agent_id: run.agentId as string,
    // A deleted agent keeps its runs; showing the id is more honest than
    // inventing a name, and more useful than dropping the cost it incurred.
    agent_name: run.agentName ?? `(deleted ${String(run.agentId).slice(0, 8)})`,
    deleted: run.deleted,
    runs: run.runs,
    counted_runs: run.countedRuns,
    total_cost_usd: run.totalCostUsd === null ? null : round(run.totalCostUsd),
    avg_cost_usd:
      run.totalCostUsd === null || run.countedRuns === 0
        ? null
        : round(run.totalCostUsd / run.countedRuns, 4),
    avg_duration_ms: run.avgDurationMs === null ? null : Math.round(run.avgDurationMs),
    decided,
    accepted,
    dismissed: dec?.dismissed ?? 0,
    pending: dec?.pending ?? 0,
    // Null, not zero. Nothing decided means the rate is unknown; 0% would say
    // every finding was rejected.
    accept_rate: decided > 0 ? round(accepted / decided, 4) : null,
    accept_rate_reliable: decided >= MIN_DECISIONS_FOR_RATE,
    last_run_at: run.lastRunAt ? run.lastRunAt.toISOString() : null,
    cost_basis: run.totalCostUsd === null ? 'estimated' : 'estimated',
  };
}

/* Every cost this repository stores is DevDigest's own estimate from token
   counts and a price table — none of it has been reconciled against a provider
   invoice. Saying so in the payload is the only way the UI can label it, and
   the only honest answer to "is this what we were billed". */
function basisFor(_rows: AgentPerformanceRow[]): CostBasis {
  return 'estimated';
}

const round = (n: number, dp = 6) => Number(n.toFixed(dp));
