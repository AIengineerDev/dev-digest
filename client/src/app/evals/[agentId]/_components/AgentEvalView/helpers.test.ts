import { describe, it, expect } from "vitest";
import type { EvalRunGroup } from "@devdigest/shared";
import { regressionAlert, trendOf } from "./helpers";

const g = (over: Partial<EvalRunGroup>): EvalRunGroup => ({
  ran_at: "2026-08-27T10:00:00.000Z",
  agent_version: 1,
  model: "gpt-5.6-sol",
  system_prompt: "a\nb",
  cases_total: 2,
  complete: true,
  passed: 2,
  recall: 1,
  precision: 1,
  citation_accuracy: 1,
  cost_usd: 0.1,
  runs: [],
  ...over,
});

describe("regressionAlert", () => {
  it("is silent without a previous run — no baseline is not no regression", () => {
    expect(regressionAlert(g({}), null)).toBeNull();
  });

  it("is silent when nothing dropped", () => {
    expect(regressionAlert(g({ precision: 1 }), g({ precision: 0.9 }))).toBeNull();
  });

  it("names the WORST drop, not the first", () => {
    const alert = regressionAlert(
      g({ precision: 0.99, recall: 0.5 }),
      g({ precision: 1, recall: 1 }),
    );
    expect(alert).toEqual({ metric: "recall", pts: -50 });
  });
});

describe("trendOf", () => {
  it("reads oldest to newest — the direction a line is read", () => {
    const groups = [g({ recall: 0.9 }), g({ recall: 0.5 })]; // newest first
    expect(trendOf(groups, (x) => x.recall)).toEqual([0.5, 0.9]);
  });
});
