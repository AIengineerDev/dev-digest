import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";
import { countBySeverity, withFocused } from "./helpers";

afterEach(cleanup);

function finding(over: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

/** 2 CRITICAL, 1 WARNING, 0 SUGGESTION — the zero case is deliberate. */
const FINDINGS: FindingRecord[] = [
  finding({ id: "f1" }),
  finding({ id: "f2", title: "SSRF in webhook forwarder" }),
  finding({ id: "f3", severity: "WARNING", title: "N+1 query in user list" }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** The chip is a <button> whose text is the label followed by the count. */
function chip(label: string) {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity counters", () => {
  it("counts findings per severity", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(chip("Critical")).toHaveTextContent("2");
    expect(chip("Warning")).toHaveTextContent("1");
  });

  it("keeps a chip for a severity with no findings instead of hiding it", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(chip("Suggestion")).toHaveTextContent("0");
  });

  it("hides findings of a severity that is switched off", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();

    fireEvent.click(chip("Warning"));

    expect(screen.queryByText("N+1 query in user list")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("leaves the count on a chip unchanged when its severity is switched off", () => {
    // Counting the filtered list would show "0" here, so you could no longer
    // see what you'd be switching back on.
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(chip("Warning"));
    expect(chip("Warning")).toHaveTextContent("1");
  });

  it("restores the findings when the same chip is clicked again", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(chip("Warning"));
    fireEvent.click(chip("Warning"));
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
  });

  it("shows the empty state when every severity is switched off", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(chip("Critical"));
    fireEvent.click(chip("Warning"));
    fireEvent.click(chip("Suggestion"));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — arriving from a Smart Diff badge", () => {
  it("reveals the requested finding: expanded, and first in the list", () => {
    // jsdom has no layout, so neither of these exists on its own.
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" focusFindingId="f3" />);

    // Expanded — its rationale is on screen without a click.
    const card = document.querySelector('[data-finding-id="f3"]')!;
    expect(card).toBeInTheDocument();
    expect(card.textContent).toContain("A secret is committed.");
    expect(card.scrollIntoView).toHaveBeenCalled();
  });

  it("shows it even when the current filter would hide it", () => {
    // Clicking a badge is a request for THAT card. Answering it with an empty
    // list because a chip happens to be off is the failure this prevents.
    Element.prototype.scrollIntoView = vi.fn();
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" focusFindingId="f3" />);
    fireEvent.click(chip("Warning"));
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
  });
});

describe("withFocused", () => {
  it("puts a filtered-out finding back, at the front", () => {
    expect(withFocused([FINDINGS[0]!], FINDINGS, "f3").map((f) => f.id)).toEqual(["f3", "f1"]);
  });

  it("leaves the list alone when the finding is already shown, or is unknown", () => {
    expect(withFocused(FINDINGS, FINDINGS, "f3")).toBe(FINDINGS);
    expect(withFocused(FINDINGS, FINDINGS, "nope")).toBe(FINDINGS);
    expect(withFocused(FINDINGS, FINDINGS, null)).toBe(FINDINGS);
  });
});

describe("countBySeverity", () => {
  it("seeds every severity so an absent one reports 0, not undefined", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("counts each severity independently", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 });
  });
});
