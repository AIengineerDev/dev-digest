import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FindingsCount } from "./FindingsCount";

afterEach(cleanup);

describe("FindingsCount", () => {
  it("renders one number per severity that occurs", () => {
    render(<FindingsCount counts={{ CRITICAL: 3, WARNING: 5, SUGGESTION: 2 }} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("drops severities with no findings instead of printing 0", () => {
    // The list is scanned at a glance — a row of zeros is noise, unlike the
    // detail-page chips, where a 0 is a switch you can still turn on.
    render(<FindingsCount counts={{ CRITICAL: 0, WARNING: 4, SUGGESTION: 0 }} />);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows an em dash for a PR that was never reviewed", () => {
    render(<FindingsCount counts={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an em dash for a reviewed PR that came back clean", () => {
    render(<FindingsCount counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("labels each group for screen readers and hover", () => {
    render(<FindingsCount counts={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByTitle("1 Critical")).toBeInTheDocument();
  });
});
