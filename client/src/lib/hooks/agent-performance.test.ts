import { describe, expect, it } from "vitest";
import type { AgentPerformanceRow } from "@devdigest/shared";
import { periodFor, sortRows } from "./agent-performance";

const row = (p: Partial<AgentPerformanceRow>): AgentPerformanceRow => ({
  agent_id: p.agent_id ?? "a",
  agent_name: p.agent_name ?? "Agent",
  deleted: false,
  runs: 0,
  counted_runs: 0,
  total_cost_usd: null,
  avg_cost_usd: null,
  avg_duration_ms: null,
  decided: 0,
  accepted: 0,
  dismissed: 0,
  pending: 0,
  accept_rate: null,
  accept_rate_reliable: false,
  last_run_at: null,
  cost_basis: "estimated",
  accept_rate_change: null,
  ...p,
});

describe("sortRows by accept rate", () => {
  it("ranks a well-sampled agent above a perfect one-off", () => {
    // The whole point: 1-of-1 at 100% is noise, 78-of-100 is a result. Sorting
    // them by rate alone puts the noise on top of the dashboard.
    const lucky = row({ agent_id: "lucky", accept_rate: 1, decided: 1, accepted: 1, accept_rate_reliable: false });
    const proven = row({ agent_id: "proven", accept_rate: 0.78, decided: 100, accepted: 78, accept_rate_reliable: true });

    expect(sortRows([lucky, proven], "acceptRate").map((r) => r.agent_id)).toEqual(["proven", "lucky"]);
  });

  it("puts an unknown rate last, never at zero", () => {
    const known = row({ agent_id: "known", accept_rate: 0.1, decided: 20, accepted: 2, accept_rate_reliable: true });
    const untriaged = row({ agent_id: "untriaged", accept_rate: null, decided: 0 });

    // Nothing decided is not a bad score; it is no score, and it sorts below
    // even a poor measured one.
    expect(sortRows([untriaged, known], "acceptRate").map((r) => r.agent_id)).toEqual(["known", "untriaged"]);
  });

  it("orders reliable rows among themselves by rate", () => {
    const hi = row({ agent_id: "hi", accept_rate: 0.9, decided: 50, accept_rate_reliable: true });
    const lo = row({ agent_id: "lo", accept_rate: 0.3, decided: 50, accept_rate_reliable: true });

    expect(sortRows([lo, hi], "acceptRate").map((r) => r.agent_id)).toEqual(["hi", "lo"]);
  });
});

describe("sortRows by a numeric column", () => {
  it("sorts descending and keeps nulls last", () => {
    const rows = [
      row({ agent_id: "none", avg_cost_usd: null }),
      row({ agent_id: "cheap", avg_cost_usd: 0.01 }),
      row({ agent_id: "dear", avg_cost_usd: 0.4 }),
    ];
    expect(sortRows(rows, "avgCost").map((r) => r.agent_id)).toEqual(["dear", "cheap", "none"]);
  });

  it("treats a never-run agent's last run as unknown, not as the epoch", () => {
    const rows = [row({ agent_id: "never", last_run_at: null }), row({ agent_id: "ran", last_run_at: "2026-08-01T00:00:00.000Z" })];
    expect(sortRows(rows, "lastRun").map((r) => r.agent_id)).toEqual(["ran", "never"]);
  });
});

describe("periodFor", () => {
  it("makes `to` exclusive so adjacent periods cannot double-count a run", () => {
    const now = new Date("2026-08-29T12:00:00.000Z");
    const day = periodFor("1d", now);
    const month = periodFor("30d", now);

    expect(day.to.toISOString()).toBe(now.toISOString());
    expect(day.from.toISOString()).toBe("2026-08-28T12:00:00.000Z");
    expect(month.from.toISOString()).toBe("2026-07-30T12:00:00.000Z");
  });
});
