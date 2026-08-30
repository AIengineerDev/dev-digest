import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { AgentColumn } from "./AgentColumn";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
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

describe("AgentColumn (R5/R6)", () => {
  it("renders the agent's findings", () => {
    renderWithIntl(
      <AgentColumn run={run({})} findings={[FINDING]} color="#3b82f6" onViewTrace={vi.fn()} />,
    );
    expect(screen.getByText("Bucket never resets")).toBeInTheDocument();
    expect(screen.getByText("src/ratelimit.ts:51")).toBeInTheDocument();
  });

  it("a failed run renders its error inside its own column, with a retry", () => {
    const onRetry = vi.fn();
    renderWithIntl(
      <AgentColumn
        run={run({ status: "failed", error: "invalid model id" })}
        findings={[]}
        color="#3b82f6"
        onViewTrace={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("invalid model id")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("View trace opens the drawer for THIS column's runId", () => {
    const onViewTrace = vi.fn();
    renderWithIntl(<AgentColumn run={run({})} findings={[]} color="#3b82f6" onViewTrace={onViewTrace} />);
    fireEvent.click(screen.getByText(messages.viewTrace));
    expect(onViewTrace).toHaveBeenCalledTimes(1);
  });
});
