import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingGroup, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { ConflictsSection } from "./ConflictsSection";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function finding(id: string): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "because",
    confidence: 0.8,
    kind: "finding",
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const CONFLICT_GROUP: FindingGroup = {
  key: "ratelimit.ts:50-54",
  file: "ratelimit.ts",
  anchor_start: 50,
  anchor_end: 54,
  title: "Bucket never resets",
  conflict: true,
  takes: [
    { agent_id: "a", agent_name: "Security", finding: finding("f1") },
    { agent_id: "b", agent_name: "Style", finding: null },
  ],
};

const UNANIMOUS_GROUP: FindingGroup = {
  key: "foo.ts:1-1",
  file: "foo.ts",
  anchor_start: 1,
  anchor_end: 1,
  title: "Agreed finding",
  conflict: false,
  takes: [
    { agent_id: "a", agent_name: "Security", finding: finding("f2") },
    { agent_id: "b", agent_name: "Style", finding: finding("f3") },
  ],
};

describe("ConflictsSection (R4)", () => {
  it("Show only conflicts hides unanimous groups and keeps the conflicting one", () => {
    renderWithIntl(<ConflictsSection groups={[CONFLICT_GROUP, UNANIMOUS_GROUP]} />);
    expect(screen.getByText("Bucket never resets")).toBeInTheDocument();
    expect(screen.getByText("Agreed finding")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.getByText("Bucket never resets")).toBeInTheDocument();
    expect(screen.queryByText("Agreed finding")).not.toBeInTheDocument();
  });

  it("a did-not-flag cell renders the muted label alone, no note", () => {
    renderWithIntl(<ConflictsSection groups={[CONFLICT_GROUP]} />);
    expect(screen.getByText(messages.conflicts.didNotFlag)).toBeInTheDocument();
  });

  it("a run where every agent agrees renders the empty state, not an empty box", () => {
    renderWithIntl(<ConflictsSection groups={[UNANIMOUS_GROUP]} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText(messages.conflicts.empty)).toBeInTheDocument();
  });
});
