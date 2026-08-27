import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextDocDetail } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/agents.json";

import { PreviewPanel } from "./PreviewPanel";

afterEach(cleanup);

function renderPanel(props: Partial<Parameters<typeof PreviewPanel>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <PreviewPanel
        path="docs/prd.md"
        missing={false}
        tooLarge={false}
        detail={undefined}
        isLoading={false}
        isError={false}
        onClose={onClose}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onClose };
}

const DETAIL: ProjectContextDocDetail = {
  path: "docs/prd.md",
  content: "# PRD\n\nSome **bold** text and a `code` span.",
  tokens: 10,
  attachments: [],
  github_url: null,
  missing: false,
};

describe("PreviewPanel", () => {
  it("shows the document's full repo-relative path in the header", () => {
    renderPanel();
    expect(screen.getByText("docs/prd.md")).toBeInTheDocument();
  });

  it("renders the document body as markdown, not raw text", () => {
    renderPanel({ detail: DETAIL });
    expect(screen.getByRole("heading", { name: "PRD" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
  });

  it("calls onClose when the × control is clicked", () => {
    const { onClose } = renderPanel({ detail: DETAIL });
    fireEvent.click(screen.getByLabelText('Close preview of "docs/prd.md"'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state while the detail query is pending", () => {
    renderPanel({ isLoading: true });
    expect(screen.getByLabelText("Loading document…")).toBeInTheDocument();
  });

  it("shows an error state when the detail query fails", () => {
    renderPanel({ isError: true });
    expect(screen.getByText("Couldn't load this document")).toBeInTheDocument();
  });

  it("shows a missing state instead of an empty body for a document gone from the repo", () => {
    renderPanel({ missing: true });
    expect(screen.getByText("No longer in the repository")).toBeInTheDocument();
  });

  it("shows a too-large state instead of silently truncating the body", () => {
    renderPanel({ tooLarge: true, detail: DETAIL });
    expect(screen.getByText("Too large to preview")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "PRD" })).not.toBeInTheDocument();
  });
});
