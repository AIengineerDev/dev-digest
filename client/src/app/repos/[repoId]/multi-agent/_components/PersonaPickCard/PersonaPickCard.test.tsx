import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/runs.json";
import { PersonaPickCard } from "./PersonaPickCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const AGENT: Agent = {
  id: "a1",
  name: "Security Reviewer",
  description: "Flags security issues.",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "s",
  enabled: true,
  version: 1,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

describe("PersonaPickCard (R8/R9)", () => {
  it("an agent with no run history shows the absence label, never ~0s · $0.00", () => {
    renderWithIntl(<PersonaPickCard agent={AGENT} color="#3b82f6" selected={false} onToggle={vi.fn()} />);
    expect(screen.getByText(messages.page.config.noEstimateYet)).toBeInTheDocument();
  });

  it("shows the median estimate when history exists", () => {
    renderWithIntl(
      <PersonaPickCard
        agent={AGENT}
        color="#3b82f6"
        selected={false}
        estimate={{ agent_id: "a1", median_duration_ms: 4200, median_cost_usd: 0.12 }}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("4.2s · $0.12")).toBeInTheDocument();
  });

  it("clicking the card toggles it", () => {
    const onToggle = vi.fn();
    renderWithIntl(<PersonaPickCard agent={AGENT} color="#3b82f6" selected={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByText("Security Reviewer"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
