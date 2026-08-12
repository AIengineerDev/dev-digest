import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
  useAgentSkills: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("offers a Skills tab and renders it when selected", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    // The tab strip lists it, and the panel below is the Skills tab, not Config.
    expect(screen.getAllByText("Skills").length).toBeGreaterThan(0);
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 0 enabled")).toBeInTheDocument();
  });
});
