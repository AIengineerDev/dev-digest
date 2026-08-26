import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SectionShell } from "./SectionShell";

afterEach(cleanup);

describe("SectionShell", () => {
  it("is a real button with aria-expanded/aria-controls, and toggles on click", () => {
    render(
      <SectionShell kind="architecture_overview" icon="Boxes" title="Architecture overview">
        <p>content</p>
      </SectionShell>,
    );
    const btn = screen.getByRole("button", { expanded: true });
    expect(btn).toHaveAttribute("aria-controls", "architecture_overview-panel");
    expect(screen.getByText("content")).toBeInTheDocument();

    fireEvent.click(btn);
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders the section id as the anchor target for the rail", () => {
    const { container } = render(
      <SectionShell kind="critical_paths" icon="Activity" title="Critical paths" />,
    );
    expect(container.querySelector("#critical_paths")).toBeInTheDocument();
  });

  it("renders emptyReason instead of children — never a hidden section (A23)", () => {
    render(
      <SectionShell kind="how_to_run" icon="Command" title="How to run" emptyReason="no runnable configuration found">
        <p>steps</p>
      </SectionShell>,
    );
    expect(screen.getByText("no runnable configuration found")).toBeInTheDocument();
    expect(screen.queryByText("steps")).not.toBeInTheDocument();
  });

  it("renders the skeleton marker above content when there is no empty reason (A26)", () => {
    render(
      <SectionShell kind="how_to_run" icon="Command" title="How to run" skeletonMarker="No summary generated">
        <p>steps</p>
      </SectionShell>,
    );
    expect(screen.getByText("No summary generated")).toBeInTheDocument();
    expect(screen.getByText("steps")).toBeInTheDocument();
  });
});
