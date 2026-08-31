/* hooks/agent-performance.ts — the global Agent Performance dashboard.

   Reads stored runs and findings. Nothing here starts a review and nothing
   calls a model: reloading, sorting or changing the period is a select, not
   work. `staleTime` is deliberately short rather than zero — refetching on
   focus is cheap here and a stale cost figure is worse than a re-read. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentPerformance, AgentPerformanceRow } from "@devdigest/shared";

export type PeriodKey = "1d" | "30d" | "custom";

export interface Period {
  key: PeriodKey;
  from: Date;
  to: Date;
}

const DAY = 24 * 60 * 60 * 1000;

/** `to` is exclusive, so two adjacent periods never count the same run twice. */
export function periodFor(key: Exclude<PeriodKey, "custom">, now = new Date()): Period {
  const days = key === "1d" ? 1 : 30;
  return { key, from: new Date(now.getTime() - days * DAY), to: now };
}

export function customPeriod(from: Date, to: Date): Period {
  return { key: "custom", from, to };
}

export function useAgentPerformance(period: Period) {
  const from = period.from.toISOString();
  const to = period.to.toISOString();

  return useQuery<AgentPerformance>({
    queryKey: ["agent-performance", from, to],
    queryFn: () =>
      api.get<AgentPerformance>(
        `/agents/performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    staleTime: 30_000,
  });
}

/** One agent over the same window, from the same aggregation the dashboard
 *  uses — this is what makes a row and that agent's own Stats agree. */
export function useAgentPerformanceRow(agentId: string | null, period: Period) {
  const from = period.from.toISOString();
  const to = period.to.toISOString();

  return useQuery<AgentPerformanceRow | null>({
    queryKey: ["agent-performance", agentId, from, to],
    enabled: Boolean(agentId),
    queryFn: () =>
      api.get<AgentPerformanceRow | null>(
        `/agents/${agentId}/performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    staleTime: 30_000,
  });
}

export type SortKey = "runs" | "avgCost" | "avgDuration" | "acceptRate" | "lastRun";

/**
 * Sorting an accept rate needs care. An agent with one decision at 100% must
 * not outrank one with 78 of 100 — that is noise presented as a result. Rows
 * whose rate is unreliable, or unknown, sort below every reliable row and keep
 * their own order among themselves.
 */
export function sortRows(rows: AgentPerformanceRow[], key: SortKey, desc = true): AgentPerformanceRow[] {
  const dir = desc ? -1 : 1;
  const nullsLast = (a: number | null, b: number | null) =>
    a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : null;

  return [...rows].sort((a, b) => {
    if (key === "acceptRate") {
      if (a.accept_rate_reliable !== b.accept_rate_reliable) return a.accept_rate_reliable ? -1 : 1;
      const n = nullsLast(a.accept_rate, b.accept_rate);
      if (n !== null) return n;
      return dir * ((a.accept_rate as number) - (b.accept_rate as number));
    }
    if (key === "lastRun") {
      const av = a.last_run_at ? Date.parse(a.last_run_at) : null;
      const bv = b.last_run_at ? Date.parse(b.last_run_at) : null;
      const n = nullsLast(av, bv);
      if (n !== null) return n;
      return dir * ((av as number) - (bv as number));
    }
    const pick = (r: AgentPerformanceRow) =>
      key === "runs" ? r.runs : key === "avgCost" ? r.avg_cost_usd : r.avg_duration_ms;
    const n = nullsLast(pick(a), pick(b));
    if (n !== null) return n;
    return dir * ((pick(a) as number) - (pick(b) as number));
  });
}
