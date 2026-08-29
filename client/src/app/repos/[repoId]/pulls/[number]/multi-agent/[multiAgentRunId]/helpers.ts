import type { FindingGroup, FindingRecord, RunSummary } from "@devdigest/shared";

// colorForIndex moved to `@/lib/agent-colors` — shared with the Configure run
// screen, the second consumer that made it worth promoting.
export { colorForIndex } from "@/lib/agent-colors";

/**
 * This agent's own findings, extracted from the server-computed groups —
 * never recomputed client-side (R3's grouping is server-side; see `spec`
 * Decisions). A silent take (`finding: null`) contributes nothing.
 */
export function findingsForAgent(groups: FindingGroup[], agentId: string): FindingRecord[] {
  const out: FindingRecord[] = [];
  for (const g of groups) {
    for (const take of g.takes) {
      if (take.agent_id === agentId && take.finding) out.push(take.finding);
    }
  }
  return out;
}

/** Total time is the MAX of the members (parallel fan-out), not the sum. */
export function totalDurationMs(runs: RunSummary[]): number {
  return runs.reduce((acc, r) => Math.max(acc, r.duration_ms ?? 0), 0);
}

/** Total cost is the SUM — every member's own bill. */
export function totalCostUsd(runs: RunSummary[]): number {
  return runs.reduce((acc, r) => acc + (r.cost_usd ?? 0), 0);
}
