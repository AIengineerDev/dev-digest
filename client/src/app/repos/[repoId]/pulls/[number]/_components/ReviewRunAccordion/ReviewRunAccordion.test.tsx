import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);
beforeEach(() => {
  // jsdom has neither of these; the reveal path uses both.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

function finding(over: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Caller input is interpolated into SQL",
    file: "src/db/users.ts",
    start_line: 27,
    end_line: 37,
    rationale: "The email is concatenated into the WHERE clause.",
    suggestion: null,
    confidence: 0.99,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

function review(over: Partial<ReviewRecord> & { id: string }): ReviewRecord {
  return {
    pr_id: "pr1",
    agent_id: null,
    run_id: `run-${over.id}`,
    agent_name: "General Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "A summary.",
    score: 53,
    head_sha: "abc",
    created_at: "2026-08-16T21:00:00.000Z",
    findings: [],
    ...over,
  } as ReviewRecord;
}

function renderAccordion(r: ReviewRecord, focusFindingId: string | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ReviewRunAccordion
        review={r}
        prId="pr1"
        defaultOpen={false}
        headSha="abc"
        focusFindingId={focusFindingId}
      />
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion", () => {
  it("stays closed when the focused finding belongs to another run", () => {
    // The run that does not hold the finding must not open: on a PR with twenty
    // runs, an unrelated panel opening between the reader and the card they
    // clicked is what made the jump land on an empty run.
    renderAccordion(review({ id: "rv2", findings: [] }), "f1");
    expect(screen.queryByText("Caller input is interpolated into SQL")).not.toBeInTheDocument();
  });

  it("opens itself, closed by default, when it holds the focused finding", () => {
    renderAccordion(review({ id: "rv1", findings: [finding({ id: "f1" })] }), "f1");
    expect(screen.getByText("Caller input is interpolated into SQL")).toBeInTheDocument();
    // …and the card scrolled itself into view.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("shows its findings when opened by hand, with no focus at all", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ReviewRunAccordion
          review={review({ id: "rv1", findings: [finding({ id: "f1" })] })}
          prId="pr1"
          defaultOpen
          headSha="abc"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Caller input is interpolated into SQL")).toBeInTheDocument();
  });
});
