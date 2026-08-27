import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CardErrorBoundary } from "./CardErrorBoundary";

afterEach(cleanup);

function Boom(): React.ReactElement {
  throw new Error("malformed payload");
}

describe("CardErrorBoundary", () => {
  it("renders its children when nothing throws", () => {
    render(
      <CardErrorBoundary fallback="fallback text">
        <p>card content</p>
      </CardErrorBoundary>,
    );
    expect(screen.getByText("card content")).toBeInTheDocument();
  });

  it("contains a throwing child and renders the fallback instead", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <CardErrorBoundary fallback="The brief couldn't be displayed.">
        <Boom />
      </CardErrorBoundary>,
    );
    expect(screen.getByText("The brief couldn't be displayed.")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("a throwing card does not take its siblings with it", () => {
    // The regression this exists for: without the boundary, one malformed
    // brief blanked the whole Overview tab — Intent, Blast Radius and the PR
    // description included.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <>
        <CardErrorBoundary fallback="brief unavailable">
          <Boom />
        </CardErrorBoundary>
        <p>sibling card</p>
      </>,
    );
    expect(screen.getByText("brief unavailable")).toBeInTheDocument();
    expect(screen.getByText("sibling card")).toBeInTheDocument();
    spy.mockRestore();
  });
});
