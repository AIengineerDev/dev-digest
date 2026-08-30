/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
// RunCostBadge on each settled row reads the `runs` namespace.
import runsMessages from "../../../../../../../../messages/en/runs.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1", number: "42" }),
}));

import { RunHistory } from "./RunHistory";
import { severityCountsByRun, type SeverityCounts } from "./helpers";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    head_sha: null,
    multi_agent_run_id: null,
    ...o,
  };
}

const CURRENT_HEAD = "bbbbbbb222";

function renderRuns(runs: RunSummary[], severityCounts?: Record<string, SeverityCounts>) {
  // FindingsCount (reused from the PR list) fetches findings on hover, so the
  // timeline now needs a query client even though nothing here hovers.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, runs: runsMessages }}>
        <RunHistory
          runs={runs}
          severityCounts={severityCounts}
          currentHeadSha={CURRENT_HEAD}
          onOpenTrace={() => {}}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — severity breakdown", () => {
  it("shows one icon+count per present severity instead of the flat 'N finding(s)'", () => {
    renderRuns([run({ status: "done", findings_count: 4, blockers: 1, score: 40 })], {
      "run-1": { CRITICAL: 1, WARNING: 3, SUGGESTION: 0 },
    });
    expect(screen.getByTitle("1 Critical")).toBeInTheDocument();
    expect(screen.getByTitle("3 Warning")).toBeInTheDocument();
    // A zero severity is dropped, exactly as in the PR list.
    expect(screen.queryByTitle(/Suggestion/)).not.toBeInTheDocument();
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
    // The blocker count still rides alongside the icons.
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
  });

  it("falls back to the text when the run has no breakdown (review deleted / not loaded)", () => {
    renderRuns([run({ status: "done", findings_count: 4, blockers: 0, score: 40 })]);
    expect(screen.getByText("4 finding(s)")).toBeInTheDocument();
  });

  it("a clean run keeps '0 finding(s)' rather than the list's em dash", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 100 })], {
      "run-1": { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
    });
    expect(screen.getByText("0 finding(s)")).toBeInTheDocument();
  });
});

describe("RunHistory — stale runs", () => {
  it("marks a run whose head_sha is no longer the PR's, and leaves current ones alone", () => {
    renderRuns([run({ run_id: "old", head_sha: "aaaaaaa111" })]);
    expect(screen.getByText("stale")).toBeInTheDocument();
    cleanup();
    renderRuns([run({ run_id: "cur", head_sha: "bbbbbbb222" })]);
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });

  it("does not mark runs that predate the column (null head_sha)", () => {
    renderRuns([run({ head_sha: null })]);
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });
});

describe("severityCountsByRun", () => {
  const finding = (severity: string) => ({ severity }) as any;
  const review = (run_id: string | null, severities: string[]) =>
    ({ run_id, findings: severities.map(finding) }) as any;

  it("keys counts by run and skips reviews with no run_id", () => {
    expect(severityCountsByRun([review("r1", ["CRITICAL", "WARNING"]), review(null, ["CRITICAL"])])).toEqual({
      r1: { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 },
    });
  });

  it("sums several reviews that share a run", () => {
    expect(severityCountsByRun([review("r1", ["CRITICAL"]), review("r1", ["CRITICAL", "SUGGESTION"])])).toEqual({
      r1: { CRITICAL: 2, WARNING: 0, SUGGESTION: 1 },
    });
  });
});

describe("RunHistory — multi-agent group header (R11)", () => {
  it("runs sharing a multi_agent_run_id get one group header with a working link, other runs stay ungrouped", () => {
    renderRuns([
      run({ run_id: "r1", agent_name: "A", multi_agent_run_id: "group-1", ran_at: "2026-06-11T18:44:34.000Z" }),
      run({ run_id: "r2", agent_name: "B", multi_agent_run_id: "group-1", ran_at: "2026-06-11T18:44:30.000Z" }),
      run({ run_id: "r3", agent_name: "C", multi_agent_run_id: "group-1", ran_at: "2026-06-11T18:44:20.000Z" }),
      run({ run_id: "r4", agent_name: "Solo", multi_agent_run_id: null, ran_at: "2026-06-11T18:44:10.000Z" }),
    ]);

    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText(runsMessages.group.compare)).toBeInTheDocument();
    expect(screen.getAllByText(runsMessages.group.compare)).toHaveLength(1);
  });

  it("a PR with only single runs shows no group header at all", () => {
    renderRuns([run({ run_id: "r1", agent_name: "Solo", multi_agent_run_id: null })]);
    expect(screen.queryByText(runsMessages.group.compare)).not.toBeInTheDocument();
  });
});
