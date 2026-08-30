import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/runs.json";
import { RunConfig } from "./RunConfig";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function agent(id: string, name: string): Agent {
  return {
    id,
    name,
    description: "d",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "s",
    enabled: true,
    version: 1,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
  };
}

const PR: PrMeta = {
  id: "pr1",
  number: 482,
  title: "Add rate limiting",
  author: "a",
  branch: "b",
  base: "main",
  head_sha: "sha",
  status: "needs_review",
  additions: 1,
  deletions: 0,
  files_count: 1,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
} as PrMeta;

describe("RunConfig (R8/R9)", () => {
  it("before a PR is chosen, step 2 is the dashed placeholder and the run button is disabled", () => {
    renderWithIntl(
      <RunConfig
        prs={[PR]}
        selectedPr={null}
        onSelectPr={vi.fn()}
        agents={[agent("a1", "Security")]}
        selected={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onClearAll={vi.fn()}
        estimates={[]}
        running={false}
        onRun={vi.fn()}
      />,
    );
    expect(screen.getByText(messages.page.config.noPrTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.page.config.selectAgents).closest("button")).toBeDisabled();
  });

  it("choosing agents shows the run button reading N and enables it", () => {
    renderWithIntl(
      <RunConfig
        prs={[PR]}
        selectedPr={PR}
        onSelectPr={vi.fn()}
        agents={[agent("a1", "Security"), agent("a2", "Style")]}
        selected={new Set(["a1", "a2"])}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onClearAll={vi.fn()}
        estimates={[]}
        running={false}
        onRun={vi.fn()}
      />,
    );
    const label = messages.page.config.runN.replace("{count}", "2");
    const button = screen.getByText(label).closest("button");
    expect(button).not.toBeDisabled();
  });

  it("clicking run fires onRun", () => {
    const onRun = vi.fn();
    renderWithIntl(
      <RunConfig
        prs={[PR]}
        selectedPr={PR}
        onSelectPr={vi.fn()}
        agents={[agent("a1", "Security")]}
        selected={new Set(["a1"])}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onClearAll={vi.fn()}
        estimates={[]}
        running={false}
        onRun={onRun}
      />,
    );
    fireEvent.click(screen.getByText(messages.page.config.runOne));
    expect(onRun).toHaveBeenCalledTimes(1);
  });
});
