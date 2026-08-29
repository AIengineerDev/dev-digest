import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** A finding as surfaced in a multi-agent column (subset of FindingRecord). */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  kind: z.string().nullish(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['done', 'failed', 'running']),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a contended file:line. */
export const ConflictTake = z.object({
  agent_id: z.string(),
  persona: z.string(),
  /** Severity if the agent flagged it, or 'ignored' when it did not. */
  verdict: z.union([Severity, z.literal('ignored')]),
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * A conflict = a file:line that at least one agent flagged and at least one
 * other agent (that also reviewed) did NOT, OR where agents assigned divergent
 * severities. Computed from persisted findings; not stored.
 */
export const Conflict = z.object({
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of POST /pulls/:id/multi-agent-run and GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;

/* ── Agent performance ─────────────────────────────────────────────────────
   The global dashboard and a single agent's Stats read the SAME shape from the
   SAME aggregation. `AgentStats` above is one agent over a period; the rows in
   `AgentPerformance` are that shape, so a number shown on the dashboard and the
   number on that agent's own page cannot disagree — there is only one of them.

   Nothing here triggers work: every field is computed from runs and findings
   already stored. Opening, sorting or reloading the dashboard must never start
   a review or a model call.                                                  */

export const PerfPeriod = z.object({
  /** ISO-8601, inclusive. */
  from: z.string(),
  /** ISO-8601, exclusive, so adjacent periods do not double-count a run. */
  to: z.string(),
});
export type PerfPeriod = z.infer<typeof PerfPeriod>;

/** How a cost figure was arrived at. Estimated and reconciled must never be
 *  presented as the same number without saying which is which. */
export const CostBasis = z.enum(['estimated', 'reconciled', 'mixed']);
export type CostBasis = z.infer<typeof CostBasis>;

export const AgentPerformanceRow = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  /** Null when the agent was deleted but its runs remain. */
  deleted: z.boolean(),
  runs: z.number().int(),
  /** Runs that produced a usable result. Cost and duration average over these. */
  counted_runs: z.number().int(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_duration_ms: z.number().nullable(),
  /** Findings acted on in the period — the denominator of accept_rate. */
  decided: z.number().int(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  /** 0..1 over `decided`. Null when nothing was decided: a rate over zero
   *  decisions is not 0%, it is unknown, and rendering it as 0% is a lie. */
  accept_rate: z.number().nullable(),
  /** False when `decided` is below the threshold the API applies. The UI must
   *  mark these rather than ranking them silently against well-sampled rows. */
  accept_rate_reliable: z.boolean(),
  last_run_at: z.string().nullable(),
  cost_basis: CostBasis,
});
export type AgentPerformanceRow = z.infer<typeof AgentPerformanceRow>;

export const CostSlice = z.object({
  label: z.string(),
  cost_usd: z.number(),
  runs: z.number().int(),
});
export type CostSlice = z.infer<typeof CostSlice>;

export const AgentPerformance = z.object({
  period: PerfPeriod,
  /** Totals over the same counted runs the rows use, so the breakdowns sum to
   *  the total exactly rather than approximately. */
  total_runs: z.number().int(),
  counted_runs: z.number().int(),
  total_cost_usd: z.number(),
  cost_basis: CostBasis,
  /** Mean of the per-agent rates weighted by decisions, not a mean of means.
   *  Null when nothing was decided anywhere in the period. */
  avg_accept_rate: z.number().nullable(),
  total_decided: z.number().int(),
  /** Most runs in the period. Null when no agent ran at all. */
  most_active: z
    .object({ agent_id: z.string(), agent_name: z.string(), runs: z.number().int(), accept_rate: z.number().nullable() })
    .nullable(),
  rows: z.array(AgentPerformanceRow),
  cost_by_agent: z.array(CostSlice),
  cost_by_model: z.array(CostSlice),
  /** Runs excluded from cost and duration, and why — so a total that looks low
   *  can be explained instead of doubted. */
  excluded: z.object({
    no_cost: z.number().int(),
    failed: z.number().int(),
  }),
  /** The minimum decisions a row needs before `accept_rate_reliable` is true. */
  min_decisions_for_rate: z.number().int(),
});
export type AgentPerformance = z.infer<typeof AgentPerformance>;
