import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

/**
 * The eval-case action's availability rule (spec 13, R1). An undecided finding
 * carries no label, so there is nothing to turn into a case. The button is
 * rendered anyway and DISABLED, with a title saying why: the action stays
 * discoverable, which is what tells someone the accept/dismiss click has a
 * second purpose.
 */
describe("FindingCard eval-case action", () => {
  it("is disabled on an undecided finding", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.getByRole("button", { name: /turn into eval case/i })).toBeDisabled();
  });

  it("is offered once the finding is accepted", () => {
    renderWithIntl(
      <FindingCard
        f={{ ...FINDING, accepted_at: "2026-08-05T10:00:00Z" }}
        defaultExpanded
        onAction={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /turn into eval case/i })).toBeEnabled();
  });

  it("is offered once the finding is dismissed", () => {
    renderWithIntl(
      <FindingCard
        f={{ ...FINDING, dismissed_at: "2026-08-05T10:00:00Z" }}
        defaultExpanded
        onAction={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /turn into eval case/i })).toBeEnabled();
  });
});
