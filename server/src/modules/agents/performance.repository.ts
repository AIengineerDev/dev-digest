import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * A2 — agent performance data-access.
 *
 * ONE aggregation, read by two surfaces: a single agent's Stats and the global
 * Agent Performance dashboard. They cannot disagree because there is only one
 * of them — the dashboard's row for an agent IS that agent's stats over the
 * same period.
 *
 * Reads only. Nothing here starts a review, and nothing here calls a model:
 * every number comes from `agent_runs` and `findings` rows already stored.
 *
 * Two decisions worth knowing before reading the SQL:
 *
 * 1. **Cost and duration average over *counted* runs, not all runs.** A run that
 *    failed before it produced anything has no cost to average, and including it
 *    as a zero drags every average toward zero. `runs` and `counted_runs` are
 *    both returned so the difference is visible rather than hidden.
 *
 * 2. **Accept rate's denominator is decided findings, never total findings.** A
 *    pending finding is not a rejection. An agent whose findings nobody has
 *    triaged has an *unknown* accept rate, and the API returns null for it —
 *    rendering that as 0% would report a quality problem that does not exist.
 */

/** Below this many decisions a rate is reported but flagged unreliable. Ranking
 *  a 1-of-1 agent above a 78-of-100 agent is noise presented as a result. */
export const MIN_DECISIONS_FOR_RATE = 5;

export interface PerfWindow {
  workspaceId: string;
  /** inclusive */
  from: Date;
  /** exclusive — adjacent periods must not double-count a run on the boundary */
  to: Date;
}

export interface AgentRunAggregate {
  agentId: string | null;
  agentName: string | null;
  deleted: boolean;
  runs: number;
  countedRuns: number;
  totalCostUsd: number | null;
  avgDurationMs: number | null;
  lastRunAt: Date | null;
  /** runs excluded from cost because they carry none */
  noCost: number;
  failed: number;
}

export interface AgentDecisionAggregate {
  agentId: string;
  decided: number;
  accepted: number;
  dismissed: number;
  pending: number;
}

export interface ModelCostSlice {
  model: string | null;
  costUsd: number;
  runs: number;
}

export class AgentPerformanceRepository {
  constructor(private readonly db: Db) {}

  /** A run counts toward cost and duration when it did not fail. */
  private countable() {
    return sql`(${t.agentRuns.status} IS NULL OR ${t.agentRuns.status} <> 'failed')`;
  }

  private inWindow(w: PerfWindow) {
    return and(
      eq(t.agentRuns.workspaceId, w.workspaceId),
      gte(t.agentRuns.ranAt, w.from),
      lt(t.agentRuns.ranAt, w.to),
    );
  }

  /** Runs, cost and duration per agent over the window. */
  async runsByAgent(w: PerfWindow): Promise<AgentRunAggregate[]> {
    const rows = await this.db
      .select({
        agentId: t.agentRuns.agentId,
        agentName: t.agents.name,
        runs: sql<number>`count(*)::int`,
        countedRuns: sql<number>`count(*) filter (where ${this.countable()})::int`,
        totalCostUsd: sql<number | null>`sum(${t.agentRuns.costUsd}) filter (where ${this.countable()})`,
        avgDurationMs: sql<number | null>`avg(${t.agentRuns.durationMs}) filter (where ${this.countable()})`,
        lastRunAt: sql<Date | null>`max(${t.agentRuns.ranAt})`,
        noCost: sql<number>`count(*) filter (where ${t.agentRuns.costUsd} is null)::int`,
        failed: sql<number>`count(*) filter (where ${t.agentRuns.status} = 'failed')::int`,
      })
      .from(t.agentRuns)
      // left join: a run outlives the agent it ran, and dropping those runs
      // would make the dashboard's total disagree with the billing it explains.
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(this.inWindow(w))
      .groupBy(t.agentRuns.agentId, t.agents.name);

    return rows.map((r) => ({
      agentId: r.agentId,
      agentName: r.agentName,
      deleted: r.agentId !== null && r.agentName === null,
      runs: Number(r.runs),
      countedRuns: Number(r.countedRuns),
      totalCostUsd: r.totalCostUsd === null ? null : Number(r.totalCostUsd),
      avgDurationMs: r.avgDurationMs === null ? null : Number(r.avgDurationMs),
      lastRunAt: r.lastRunAt ? new Date(r.lastRunAt) : null,
      noCost: Number(r.noCost),
      failed: Number(r.failed),
    }));
  }

  /**
   * Findings decided per agent, over the window.
   *
   * The window applies to the **run**, not to the moment someone clicked accept.
   * Attributing a decision to the period it was made in would move an agent's
   * accept rate for a month that is already closed.
   */
  async decisionsByAgent(w: PerfWindow): Promise<AgentDecisionAggregate[]> {
    const rows = await this.db
      .select({
        agentId: t.reviews.agentId,
        accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)::int`,
        dismissed: sql<number>`count(*) filter (where ${t.findings.dismissedAt} is not null)::int`,
        pending: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is null)::int`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
      .where(and(this.inWindow(w), isNotNull(t.reviews.agentId)))
      .groupBy(t.reviews.agentId);

    return rows.map((r) => {
      const accepted = Number(r.accepted);
      const dismissed = Number(r.dismissed);
      return {
        agentId: String(r.agentId),
        accepted,
        dismissed,
        decided: accepted + dismissed,
        pending: Number(r.pending),
      };
    });
  }

  /**
   * Runs and cost bucketed over the window, for the sparkline.
   *
   * Buckets are generated by the database, not by counting the rows that exist,
   * so a day with no runs is a zero rather than a gap. A sparkline drawn from
   * present-days-only silently compresses quiet periods and reads as steady
   * activity that never happened.
   */
  async series(w: PerfWindow, buckets = 14): Promise<{ at: Date; runs: number; costUsd: number }[]> {
    const span = Math.max(w.to.getTime() - w.from.getTime(), 1);
    const step = Math.ceil(span / buckets);

    const rows = await this.db
      .select({
        bucket: sql<number>`floor(extract(epoch from (${t.agentRuns.ranAt} - ${w.from.toISOString()}::timestamptz)) * 1000 / ${step})::int`,
        runs: sql<number>`count(*)::int`,
        costUsd: sql<number | null>`sum(${t.agentRuns.costUsd}) filter (where ${this.countable()})`,
      })
      .from(t.agentRuns)
      .where(this.inWindow(w))
      .groupBy(sql`1`);

    const byBucket = new Map(rows.map((r) => [Number(r.bucket), r]));
    return Array.from({ length: buckets }, (_, i) => {
      const hit = byBucket.get(i);
      return {
        at: new Date(w.from.getTime() + i * step),
        runs: hit ? Number(hit.runs) : 0,
        costUsd: hit?.costUsd ? Number(hit.costUsd) : 0,
      };
    });
  }

  /** Cost per model over the same counted runs the totals use. */
  async costByModel(w: PerfWindow): Promise<ModelCostSlice[]> {
    const rows = await this.db
      .select({
        model: t.agentRuns.model,
        costUsd: sql<number | null>`sum(${t.agentRuns.costUsd})`,
        runs: sql<number>`count(*)::int`,
      })
      .from(t.agentRuns)
      .where(and(this.inWindow(w), this.countable()))
      .groupBy(t.agentRuns.model);

    return rows.map((r) => ({
      model: r.model,
      costUsd: r.costUsd === null ? 0 : Number(r.costUsd),
      runs: Number(r.runs),
    }));
  }
}
