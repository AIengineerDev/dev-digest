import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Convention } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CONVENTION: Convention = {
  id: "c1",
  repo_id: "r1",
  category: "error-handling",
  rule: "Route handlers throw ValidationError instead of returning a bare 400.",
  rationale: "One error taxonomy; the error handler owns status codes.",
  evidence_path: "src/api/handler.ts",
  evidence_line: 5,
  evidence_snippet: 'if (!parsed.success) throw new ValidationError("bad input");',
  confidence: 0.9,
  status: "pending",
  head_sha: "deadbeefcafe",
  created_at: "2026-08-09T10:00:00.000Z",
};

function renderCard(overrides: Partial<Convention> = {}, props = {}) {
  const onDecide = vi.fn();
  const onEdit = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        convention={{ ...CONVENTION, ...overrides }}
        repoFullName="acme/payments-api"
        defaultBranch="main"
        busy={false}
        onDecide={onDecide}
        onEdit={onEdit}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onDecide, onEdit };
}

describe("ConventionCard", () => {
  it("shows the rule, its evidence and the confidence", () => {
    renderCard();
    expect(screen.getByText(CONVENTION.rule)).toBeInTheDocument();
    expect(screen.getByText(CONVENTION.evidence_snippet)).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("links the evidence to the commit the scan ran against, not to the branch", () => {
    renderCard();
    const link = screen.getByRole("link", { name: "src/api/handler.ts:5" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/deadbeefcafe/src/api/handler.ts#L5",
    );
  });

  it("falls back to the default branch when the scan recorded no head", () => {
    renderCard({ head_sha: null });
    expect(screen.getByRole("link", { name: "src/api/handler.ts:5" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/main/src/api/handler.ts#L5",
    );
  });

  it("reports accept and reject as verdicts on this candidate", () => {
    const { onDecide } = renderCard();
    fireEvent.click(screen.getByText("Accept"));
    expect(onDecide).toHaveBeenCalledWith("c1", "accepted");
    fireEvent.click(screen.getByText("Reject"));
    expect(onDecide).toHaveBeenCalledWith("c1", "rejected");
  });

  it("edits the rule in place and saves the edited text", () => {
    const { onEdit } = renderCard();
    fireEvent.click(screen.getByText("Edit first"));
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "Handlers throw ValidationError." } });
    fireEvent.click(screen.getByText("Save"));
    expect(onEdit).toHaveBeenCalledWith("c1", {
      rule: "Handlers throw ValidationError.",
      category: "error-handling",
    });
  });

  it("does not write when an edit changed nothing", () => {
    const { onEdit } = renderCard();
    fireEvent.click(screen.getByText("Edit first"));
    fireEvent.click(screen.getByText("Save"));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("cancelling an edit restores the original rule", () => {
    const { onEdit } = renderCard();
    fireEvent.click(screen.getByText("Edit first"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "something else" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText(CONVENTION.rule)).toBeInTheDocument();
  });

  it("marks a decided candidate and disables the verdict it already has", () => {
    renderCard({ status: "accepted" });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Accept").closest("button")).toBeDisabled();
    expect(screen.getByText("Reject").closest("button")).not.toBeDisabled();
  });
});
