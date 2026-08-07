import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **secret** is committed.",
  suggestion: null,
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
} as FindingRecord;

// The cell fetches findings on hover; the real hook needs a QueryClient.
// `prId` is echoed back so the tests can assert the query stays disabled until hover.
const seenPrIds: (string | null | undefined)[] = [];
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null | undefined) => {
    seenPrIds.push(prId);
    return {
      data: prId ? [{ id: "r1", findings: [FINDING] }] : undefined,
      isLoading: false,
    };
  },
}));

import { FindingsCount } from "./FindingsCount";

afterEach(() => {
  cleanup();
  seenPrIds.length = 0;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsCount", () => {
  it("renders one number per severity that occurs", () => {
    renderWithIntl(<FindingsCount counts={{ CRITICAL: 3, WARNING: 5, SUGGESTION: 2 }} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("drops severities with no findings instead of printing 0", () => {
    // The list is scanned at a glance — a row of zeros is noise, unlike the
    // detail-page chips, where a 0 is a switch you can still turn on.
    renderWithIntl(<FindingsCount counts={{ CRITICAL: 0, WARNING: 4, SUGGESTION: 0 }} />);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows an em dash for a PR that was never reviewed", () => {
    renderWithIntl(<FindingsCount counts={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an em dash for a reviewed PR that came back clean", () => {
    renderWithIntl(<FindingsCount counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("labels each group for screen readers and hover", () => {
    renderWithIntl(<FindingsCount counts={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByTitle("1 Critical")).toBeInTheDocument();
  });
});

describe("FindingsCount hover preview", () => {
  const COUNTS = { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 };

  it("does not fetch findings until the cell is hovered", () => {
    // An unhovered list of N rows must not fire N requests. Passing null keeps
    // the query disabled (`enabled: !!prId` in usePrReviews).
    renderWithIntl(<FindingsCount counts={COUNTS} prId="pr1" />);
    expect(seenPrIds.every((id) => id == null)).toBe(true);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows the findings on hover and hides them again on leave", () => {
    renderWithIntl(<FindingsCount counts={COUNTS} prId="pr1" />);
    const cell = screen.getByTitle("1 Critical").parentElement!;

    fireEvent.mouseEnter(cell);
    expect(seenPrIds).toContain("pr1");
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();

    fireEvent.mouseLeave(cell);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("strips markdown from the rationale preview", () => {
    renderWithIntl(<FindingsCount counts={COUNTS} prId="pr1" />);
    fireEvent.mouseEnter(screen.getByTitle("1 Critical").parentElement!);
    expect(screen.getByText("A secret is committed.")).toBeInTheDocument();
  });

  it("renders no tooltip without a prId", () => {
    renderWithIntl(<FindingsCount counts={COUNTS} />);
    fireEvent.mouseEnter(screen.getByTitle("1 Critical").parentElement!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
