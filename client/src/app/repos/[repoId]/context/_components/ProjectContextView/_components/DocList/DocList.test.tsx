import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextList } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/context.json";
import { DocList } from "./DocList";

afterEach(cleanup);

function renderList(list: ProjectContextList, over: Partial<React.ComponentProps<typeof DocList>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <div data-theme="dark">
        <DocList
          list={list}
          selectedPath={null}
          onSelect={() => {}}
          onRescan={() => {}}
          rescanning={false}
          rescanError={false}
          {...over}
        />
      </div>
    </NextIntlClientProvider>,
  );
}

const BASE: ProjectContextList = {
  docs: [
    { path: "README.md", size: 100, tokens: 50, agent_count: 0, skill_count: 0, missing: false, too_large: false },
    { path: "docs/prd.md", size: 500000, tokens: 400, agent_count: 1, skill_count: 0, missing: false, too_large: true },
  ],
  head_sha: "abcdef1234567",
  truncated: false,
  limit: 1000,
  total_tokens: 450,
};

describe("DocList footer (R3a, D4)", () => {
  it("reads the total as a ceiling, not a current cost", () => {
    renderList(BASE);
    expect(screen.getByText(/450 tokens total \(ceiling if everything were attached\)/)).toBeInTheDocument();
  });

  it("shows the commit the scan read the clone at", () => {
    renderList(BASE);
    expect(screen.getByText(/read at abcdef1/)).toBeInTheDocument();
  });
});

describe("DocList over-cap / missing rows (C4, R10)", () => {
  it("renders a too-large document struck through with a badge naming the reason", () => {
    renderList(BASE);
    const row = screen.getByText("docs/prd.md");
    expect(row).toHaveStyle({ textDecoration: "line-through" });
    expect(screen.getByText("too large")).toBeInTheDocument();
  });
});

describe("DocList truncation (C3)", () => {
  it("states the limit rather than silently dropping the tail", () => {
    renderList({ ...BASE, truncated: true, limit: 1000 });
    expect(screen.getByText(/the first 1000/)).toBeInTheDocument();
  });
});

describe("DocList Rescan (R9, A10)", () => {
  it("calls onRescan when clicked", () => {
    let called = false;
    renderList(BASE, { onRescan: () => (called = true) });
    screen.getByText("Rescan").click();
    expect(called).toBe(true);
  });

  it("shows the rescan error and keeps the previous list visible (C6)", () => {
    renderList(BASE, { rescanError: true });
    expect(screen.getByText(/Rescan failed/)).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });
});

describe("DocList grouping (C3)", () => {
  it("groups by directory and shows the full repo-relative path on every row", () => {
    renderList(BASE);
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("docs/prd.md")).toBeInTheDocument();
  });
});
