import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

function renderWithIntl(trace: RunTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">
        <TraceBody trace={trace} findings={[]} />
      </div>
    </NextIntlClientProvider>,
  );
}

const BASE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 0, grounding: "2/2 passed" },
  prompt_assembly: {
    system: "You are a reviewer.",
    skills: null,
    memory: null,
    specs: null,
    user: "Review PR #482",
  },
  tool_calls: [],
  raw_output: "",
  memory_pulled: [],
  specs_read: [],
  log: [],
};

describe("TraceBody — project context attribution (A6, A9)", () => {
  it("lists the injected document paths in Configuration → Specs read", () => {
    renderWithIntl({ ...BASE, specs_read: ["docs/prd.md", "docs/security.md"] });
    expect(screen.getByText("docs/prd.md")).toBeInTheDocument();
    expect(screen.getByText("docs/security.md")).toBeInTheDocument();
  });

  it("shows the specs block's note with count, token size and paths, and the replay caveat (C15)", () => {
    renderWithIntl({
      ...BASE,
      prompt_assembly: {
        ...BASE.prompt_assembly,
        specs: "## Project context\n<untrusted source=\"docs/prd.md\">...</untrusted>",
        specs_used: [{ path: "docs/prd.md", sources: ["agent"], tokens: 420, status: "injected" }],
        specs_tokens: 420,
      },
    });
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(
      screen.getByText("1 · 420 tok · docs/prd.md — documents read at replay time, not pinned to this version"),
    ).toBeInTheDocument();
  });

  it("falls back to the count/paths note when specs_tokens is null, never rendering 'undefined tok'", () => {
    renderWithIntl({
      ...BASE,
      prompt_assembly: {
        ...BASE.prompt_assembly,
        specs: "## Project context",
        specs_used: [{ path: "docs/prd.md", sources: ["agent"], tokens: 420, status: "injected" }],
        specs_tokens: null,
      },
    });
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(
      screen.getByText("1 · docs/prd.md — documents read at replay time, not pinned to this version"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/undefined tok/)).not.toBeInTheDocument();
  });

  it("omits the specs block entirely when the run had no project-context slot", () => {
    renderWithIntl(BASE);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("Project context (dynamic)")).not.toBeInTheDocument();
  });
});
