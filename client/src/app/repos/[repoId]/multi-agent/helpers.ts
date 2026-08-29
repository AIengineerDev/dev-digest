import type { AgentEstimate } from "@/lib/hooks/reviews";

/**
 * R9 — the run bar's estimate over the selected agents. Total time is the MAX
 * (parallel fan-out), total cost is the SUM (every agent's own bill). An
 * agent absent from `estimates` (no run history) contributes 0 to both — the
 * caller decides whether to show the estimate line at all when nothing has
 * history; this never fabricates a `~0s · $0.00` for an individual agent.
 */
export function estimateFor(
  selectedIds: string[],
  estimates: AgentEstimate[],
): { totalTimeS: number; totalCostUsd: number; anyHistory: boolean } {
  const byId = new Map(estimates.map((e) => [e.agent_id, e]));
  let maxMs = 0;
  let sumCost = 0;
  let anyHistory = false;
  for (const id of selectedIds) {
    const e = byId.get(id);
    if (!e) continue;
    if (e.median_duration_ms != null) {
      maxMs = Math.max(maxMs, e.median_duration_ms);
      anyHistory = true;
    }
    if (e.median_cost_usd != null) {
      sumCost += e.median_cost_usd;
      anyHistory = true;
    }
  }
  return { totalTimeS: maxMs / 1000, totalCostUsd: sumCost, anyHistory };
}
