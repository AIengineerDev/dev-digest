import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import runsMessages from "../../../../../../../../../../messages/en/runs.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";

const mutateMock = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: mutateMock, isPending: false }),
}));

import { AgentTabs } from "./AgentTabs";

afterEach(() => {
  cleanup();
  mutateMock.mockClear();
});

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ runs: runsMessages, prReview: prReviewMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security",
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    error: null,
    duration_ms: 4200,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.12,
    findings_count: 1,
    grounding: "1/1 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: 82,
    blockers: 0,
    head_sha: "abc123",
    multi_agent_run_id: "group-1",
    ...o,
  };
}

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "bug",
  title: "Bucket never resets",
  file: "src/ratelimit.ts",
  start_line: 51,
  end_line: 51,
  rationale: "The bucket accumulates forever.",
  confidence: 0.9,
  kind: "finding",
  review_id: "review-1",
  accepted_at: null,
  dismissed_at: null,
};

describe("AgentTabs (R5/R6)", () => {
  it("switching tabs shows the selected agent's own findings", () => {
    renderWithProviders(
      <AgentTabs
        entries={[
          { run: run({ agent_id: "a1", agent_name: "Security" }), findings: [FINDING], color: "#3b82f6" },
          { run: run({ run_id: "run-2", agent_id: "a2", agent_name: "Style" }), findings: [], color: "#10b981" },
        ]}
        prId="pr1"
        multiAgentRunId="group-1"
        onViewTrace={vi.fn()}
      />,
    );
    expect(screen.getByText("Bucket never resets")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Style"));
    expect(screen.queryByText("Bucket never resets")).not.toBeInTheDocument();
  });

  it("accept/dismiss posts through the existing finding-action mutation", () => {
    renderWithProviders(
      <AgentTabs
        entries={[{ run: run({}), findings: [FINDING], color: "#3b82f6" }]}
        prId="pr1"
        multiAgentRunId="group-1"
        onViewTrace={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(prReviewMessages.finding.accept));
    expect(mutateMock).toHaveBeenCalledWith(
      { findingId: "f1", action: "accept", prId: "pr1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
