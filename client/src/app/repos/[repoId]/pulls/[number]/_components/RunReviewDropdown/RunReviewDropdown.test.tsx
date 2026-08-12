import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const agentsState = vi.hoisted(() => ({
  current: {
    data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }],
    isError: false,
    refetch: vi.fn(),
  } as { data?: unknown[]; isError: boolean; refetch: ReturnType<typeof vi.fn> },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => agentsState.current,
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  agentsState.current = {
    data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }],
    isError: false,
    refetch: vi.fn(),
  };
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** Open the dropdown so its items render. */
function openMenu() {
  fireEvent.click(screen.getByText("Run Review"));
}

describe("RunReviewDropdown (smoke)", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });

  it("lists the loaded agents", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openMenu();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });

  it("says the agent list FAILED rather than that there are none", () => {
    // The distinction matters: "No agents yet" sends the user to create a
    // duplicate of an agent they already have.
    agentsState.current = { data: undefined, isError: true, refetch: vi.fn() };
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openMenu();

    expect(screen.getByText(messages.runReview.agentsLoadError)).toBeInTheDocument();
    expect(screen.queryByText(messages.runReview.noAgents)).not.toBeInTheDocument();
  });

  it("still shows the empty state when the list really is empty", () => {
    agentsState.current = { data: [], isError: false, refetch: vi.fn() };
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openMenu();

    expect(screen.getByText(messages.runReview.noAgents)).toBeInTheDocument();
  });
});
