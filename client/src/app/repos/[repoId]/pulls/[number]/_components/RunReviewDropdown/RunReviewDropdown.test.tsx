import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const agentsState = vi.hoisted(() => ({
  current: {
    data: [
      { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
      { id: "a2", name: "Style", model: "gpt-4.1", enabled: true },
    ],
    isError: false,
    refetch: vi.fn(),
  } as { data?: unknown[]; isError: boolean; refetch: ReturnType<typeof vi.fn> },
}));
const runReviewState = vi.hoisted(() => ({
  mutateAsync: vi.fn(
    async (_input: { prId: string; agentId?: string; all?: boolean; agentIds?: string[] }) => ({
      pr_id: "pr1",
      runs: [] as { run_id: string; agent_id: string; agent_name: string }[],
      reviews: [] as unknown[],
      multi_agent_run_id: null as string | null,
    }),
  ),
  isPending: false,
}));
const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useParams: () => ({ repoId: "repo1", number: "42" }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => agentsState.current,
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => runReviewState,
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  agentsState.current = {
    data: [
      { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
      { id: "a2", name: "Style", model: "gpt-4.1", enabled: true },
    ],
    isError: false,
    refetch: vi.fn(),
  };
  runReviewState.mutateAsync = vi.fn(async () => ({
    pr_id: "pr1",
    runs: [],
    reviews: [],
    multi_agent_run_id: null,
  }));
  pushMock.mockClear();
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

describe("AgentPickerPopover (R1)", () => {
  function openPicker() {
    fireEvent.click(screen.getByText(messages.runReview.pickAgents));
  }

  it("the run button is disabled at zero checked", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openPicker();
    const runButton = screen.getByText(messages.runReview.runMultiAgent.replace("{count}", "0"));
    expect(runButton.closest("button")).toBeDisabled();
  });

  it("checking two agents and clicking run issues one POST with exactly {agentIds:[a,b]}, no all/agentId", async () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openPicker();

    fireEvent.click(screen.getByText("Security"));
    fireEvent.click(screen.getByText("Style"));
    // checking does not close the popover
    expect(screen.getByText("Security")).toBeInTheDocument();

    const runButton = screen.getByText(messages.runReview.runMultiAgent.replace("{count}", "2"));
    fireEvent.click(runButton);

    await waitFor(() => expect(runReviewState.mutateAsync).toHaveBeenCalledTimes(1));
    const call = runReviewState.mutateAsync.mock.calls[0]![0];
    expect(call).toEqual({ prId: "pr1", agentIds: ["a1", "a2"] });
  });

  it("unchecking does not close the popover", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openPicker();
    fireEvent.click(screen.getByText("Security"));
    fireEvent.click(screen.getByText("Security"));
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText(messages.runReview.clear)).toBeInTheDocument();
  });

  it("navigates to the multi-agent results URL when the response carries a non-null id", async () => {
    runReviewState.mutateAsync = vi.fn(async () => ({
      pr_id: "pr1",
      runs: [],
      reviews: [],
      multi_agent_run_id: "group-1",
    }));
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openPicker();
    fireEvent.click(screen.getByText("Security"));
    fireEvent.click(screen.getByText(messages.runReview.runMultiAgent.replace("{count}", "1")));
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/repos/repo1/pulls/42/multi-agent/group-1"),
    );
  });

  it("does not navigate when the response's multi_agent_run_id is null", async () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openPicker();
    fireEvent.click(screen.getByText("Security"));
    fireEvent.click(screen.getByText(messages.runReview.runMultiAgent.replace("{count}", "1")));
    await waitFor(() => expect(runReviewState.mutateAsync).toHaveBeenCalledTimes(1));
    expect(pushMock).not.toHaveBeenCalled();
  });
});
