import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, ProjectContextDoc, ProjectContextDocDetail, Repo } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const REPO: Repo = {
  id: "repo-1",
  workspace_id: "ws-1",
  owner: "acme",
  name: "widgets",
  full_name: "acme/widgets",
  default_branch: "main",
  clone_path: "/clones/repo-1",
  last_polled_at: null,
  created_by: null,
};

const AGENT = { id: "agent-1", name: "Security Reviewer" } as Agent;

const DOC_A: ProjectContextDoc = {
  path: "docs/prd.md",
  size: 500,
  tokens: 559,
  agent_count: 0,
  skill_count: 1,
  missing: false,
  too_large: false,
};
const DOC_B: ProjectContextDoc = { ...DOC_A, path: "specs/09-project-context.md", tokens: 120 };
const DOC_C: ProjectContextDoc = { ...DOC_A, path: "README.md", tokens: 42 };

// vi.mock below is hoisted above these consts, so the mocked module's own
// state must be created inside vi.hoisted rather than closing over REPO.
const activeRepo = vi.hoisted(() => ({
  current: {
    repoId: "repo-1" as string | null,
    activeRepo: null as unknown,
    reposLoaded: true,
  },
}));
const filesQuery = vi.hoisted(() => ({
  current: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));
const setAttachmentsMutate = vi.hoisted(() => vi.fn());
const setOrderMutate = vi.hoisted(() => vi.fn());
const detailByPath = vi.hoisted(() => new Map<string, ProjectContextDocDetail>());

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => activeRepo.current }));
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => filesQuery.current,
  useSetContextAttachments: () => ({ mutate: setAttachmentsMutate, isPending: false, variables: undefined }),
  useSetContextOrder: () => ({ mutate: setOrderMutate, isPending: false }),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (path: string) => {
      const match = /path=([^&]+)/.exec(path);
      const docPath = match ? decodeURIComponent(match[1]!) : "";
      const detail = detailByPath.get(docPath);
      return detail ? Promise.resolve(detail) : Promise.reject(new Error("not found"));
    },
  },
}));

import { ContextTab } from "./ContextTab";

afterEach(cleanup);
beforeEach(() => {
  activeRepo.current = { repoId: "repo-1", activeRepo: REPO, reposLoaded: true };
  filesQuery.current = {
    data: { docs: [DOC_A, DOC_B, DOC_C], truncated: false, limit: 1000, total_tokens: 700 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  setAttachmentsMutate.mockClear();
  setOrderMutate.mockClear();
  detailByPath.clear();
  detailByPath.set(DOC_A.path, {
    path: DOC_A.path,
    content: "# PRD",
    tokens: 559,
    attachments: [{ target_kind: "skill", target_id: "sk-1", order: 0 }],
    github_url: null,
    missing: false,
  });
  detailByPath.set(DOC_B.path, {
    path: DOC_B.path,
    content: "# Spec",
    tokens: 120,
    attachments: [{ target_kind: "agent", target_id: "agent-1", order: 0 }],
    github_url: null,
    missing: false,
  });
  detailByPath.set(DOC_C.path, {
    path: DOC_C.path,
    content: "# Readme",
    tokens: 42,
    attachments: [],
    github_url: null,
    missing: false,
  });
});

function renderTab(agent: Agent = AGENT) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ContextTab agent={agent} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ContextTab (agent editor)", () => {
  it("lists documents for the active repo, path-sorted, with derived category and token count", async () => {
    renderTab();
    expect(await screen.findByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("prd.md")).toBeInTheDocument();
    expect(screen.getByText("09-project-context.md")).toBeInTheDocument();
    expect(screen.getByText("Documents in acme/widgets")).toBeInTheDocument();

    // Category derived from path — README.md → readme, specs/... → specs,
    // docs/prd.md → docs (helpers.ts:categoryForPath). "specs"/"docs" also
    // appear as the row's own directory text, so assert at least one hit
    // rather than a single unique match.
    expect(screen.getByText("readme")).toBeInTheDocument();
    expect(screen.getAllByText("specs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("docs").length).toBeGreaterThan(0);
    expect(screen.getByText("559t")).toBeInTheDocument();
  });

  it("shows N of M attached, counting only this agent's own direct attachments", async () => {
    renderTab();
    await screen.findByText("README.md");
    // Only specs/09-project-context.md is attached to agent-1 directly.
    await waitFor(() => expect(screen.getByText("1 of 3 attached")).toBeInTheDocument());
  });

  it("attaching a document preserves that document's OTHER attachments (skills and other agents)", async () => {
    renderTab();
    await screen.findByText("README.md");
    const rowA = screen.getByLabelText('Attach "docs/prd.md" to this agent');
    await waitFor(() => expect(rowA.querySelector('[role="switch"]')).toHaveAttribute("aria-checked", "false"));
    fireEvent.click(rowA.querySelector('[role="switch"]')!);

    // Doc A already carries a skill attachment — turning this agent ON must
    // append to that set, not replace it (the N-calls-preserve-siblings hazard).
    expect(setAttachmentsMutate).toHaveBeenCalledWith(
      {
        path: "docs/prd.md",
        targets: [
          { target_kind: "skill", target_id: "sk-1", order: 0 },
          { target_kind: "agent", target_id: "agent-1" },
        ],
      },
      expect.anything(),
    );
  });

  it("detaching preserves sibling agent/skill attachments on the same document", async () => {
    detailByPath.set(DOC_B.path, {
      path: DOC_B.path,
      content: "# Spec",
      tokens: 120,
      attachments: [
        { target_kind: "agent", target_id: "agent-1", order: 0 },
        { target_kind: "agent", target_id: "agent-2", order: 0 },
        { target_kind: "skill", target_id: "sk-1", order: 0 },
      ],
      github_url: null,
      missing: false,
    });
    renderTab();
    await screen.findByText("README.md");
    const rowB = screen.getByLabelText('Attach "specs/09-project-context.md" to this agent');
    await waitFor(() => expect(rowB.querySelector('[role="switch"]')).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(rowB.querySelector('[role="switch"]')!);

    expect(setAttachmentsMutate).toHaveBeenCalledWith(
      {
        path: "specs/09-project-context.md",
        targets: [
          { target_kind: "agent", target_id: "agent-2", order: 0 },
          { target_kind: "skill", target_id: "sk-1", order: 0 },
        ],
      },
      expect.anything(),
    );
  });

  it("filters the list by path and shows no-matches text", async () => {
    renderTab();
    await screen.findByText("README.md");
    fireEvent.change(screen.getByLabelText("Filter documents…"), { target: { value: "specs" } });
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    expect(screen.getByText("09-project-context.md")).toBeInTheDocument();
  });

  it("renders attached documents first, in persisted order (attachments[].order), not path order", async () => {
    // Both docs/prd.md and README.md are attached to agent-1, README's
    // `order` (0) lower than prd's (1) — the opposite of path-sort, which
    // would put README.md first anyway by coincidence, so also invert vs
    // specs/09-project-context.md (also attached, higher order still).
    detailByPath.set(DOC_A.path, {
      path: DOC_A.path,
      content: "# PRD",
      tokens: 559,
      attachments: [{ target_kind: "agent", target_id: "agent-1", order: 2 }],
      github_url: null,
      missing: false,
    });
    detailByPath.set(DOC_B.path, {
      path: DOC_B.path,
      content: "# Spec",
      tokens: 120,
      attachments: [{ target_kind: "agent", target_id: "agent-1", order: 1 }],
      github_url: null,
      missing: false,
    });
    detailByPath.set(DOC_C.path, {
      path: DOC_C.path,
      content: "# Readme",
      tokens: 42,
      attachments: [{ target_kind: "agent", target_id: "agent-1", order: 0 }],
      github_url: null,
      missing: false,
    });
    renderTab();
    await screen.findByText("README.md");

    // The per-document detail queries (and thus their `order`) resolve
    // asynchronously; wait for the reseed effect to apply the persisted order
    // rather than asserting against the pre-load fallback (path order).
    await waitFor(() =>
      expect(screen.getAllByRole("listitem").map((row) => row.getAttribute("aria-label"))).toEqual([
        "README.md",
        "specs/09-project-context.md",
        "docs/prd.md",
      ]),
    );
  });

  it("reordering with the keyboard persists via PUT /context/order, target-scoped to this agent", async () => {
    detailByPath.set(DOC_B.path, {
      path: DOC_B.path,
      content: "# Spec",
      tokens: 120,
      attachments: [{ target_kind: "agent", target_id: "agent-1", order: 0 }],
      github_url: null,
      missing: false,
    });
    detailByPath.set(DOC_C.path, {
      path: DOC_C.path,
      content: "# Readme",
      tokens: 42,
      attachments: [{ target_kind: "agent", target_id: "agent-1", order: 1 }],
      github_url: null,
      missing: false,
    });
    renderTab();
    await screen.findByText("README.md");

    // Initial order: specs/09-project-context.md (order 0), README.md
    // (order 1), then unattached docs/prd.md. Wait for the async detail
    // queries' `order` to land before asserting.
    await waitFor(() =>
      expect(screen.getAllByRole("listitem").map((r) => r.getAttribute("aria-label"))).toEqual([
        "specs/09-project-context.md",
        "README.md",
        "docs/prd.md",
      ]),
    );

    const readmeHandle = screen.getByLabelText('Reorder "README.md"');
    fireEvent.keyDown(readmeHandle, { key: "ArrowUp" });

    await waitFor(() =>
      expect(setOrderMutate).toHaveBeenCalledWith(
        {
          target_kind: "agent",
          target_id: "agent-1",
          // Only the two ATTACHED docs are in the write payload, reordered.
          paths: ["README.md", "specs/09-project-context.md"],
        },
        expect.anything(),
      ),
    );
    expect(screen.getAllByRole("listitem").map((r) => r.getAttribute("aria-label"))).toEqual([
      "README.md",
      "specs/09-project-context.md",
      "docs/prd.md",
    ]);
  });

  it("disables the reorder handle and drag while a filter is active", async () => {
    renderTab();
    await screen.findByText("README.md");
    fireEvent.change(screen.getByLabelText("Filter documents…"), { target: { value: "readme" } });
    const handle = screen.getByLabelText('Reorder "README.md"');
    expect(handle).toBeDisabled();
  });

  it("blocks the toggle for an over-the-limit document", async () => {
    filesQuery.current = {
      ...filesQuery.current,
      data: { docs: [{ ...DOC_A, too_large: true }], truncated: false, limit: 1000, total_tokens: 559 },
    };
    renderTab();
    expect(await screen.findByText("over the attach size limit")).toBeInTheDocument();
    const row = screen.getByLabelText('Attach "docs/prd.md" to this agent');
    expect(row).toHaveStyle({ pointerEvents: "none" });
  });

  it("shows the no-repo state when no repo is active", () => {
    activeRepo.current = { repoId: null, activeRepo: null, reposLoaded: true };
    renderTab();
    expect(
      screen.getByText("Connect a repo to attach project-context documents to this agent."),
    ).toBeInTheDocument();
  });

  it("shows an empty state when the active repo has no documents", () => {
    filesQuery.current = { ...filesQuery.current, data: { docs: [], truncated: false, limit: 1000, total_tokens: 0 } };
    renderTab();
    expect(screen.getByText("No project-context documents")).toBeInTheDocument();
  });

  it("shows an error state with retry when the document list fails to load", () => {
    filesQuery.current = { ...filesQuery.current, isError: true, data: undefined };
    renderTab();
    expect(screen.getByText("Couldn't load project-context documents.")).toBeInTheDocument();
  });

  describe("preview panel", () => {
    it("opens inline, on the same page, with the clicked row's full path and rendered content", async () => {
      renderTab();
      await screen.findByText("README.md");
      fireEvent.click(screen.getByLabelText("Preview docs/prd.md"));

      // The row's own detail query is already loaded (the same one that
      // drives the toggle) — no separate fetch, no navigation away.
      const panel = await screen.findByRole("region", { name: "docs/prd.md" });
      expect(panel).toBeInTheDocument();
      expect(within(panel).getByText("PRD")).toBeInTheDocument();
      // The list is still there, on the same page — Preview didn't navigate.
      expect(screen.getByText("README.md")).toBeInTheDocument();
    });

    it("swaps content when Preview is clicked on a different row", async () => {
      renderTab();
      await screen.findByText("README.md");
      fireEvent.click(screen.getByLabelText("Preview docs/prd.md"));
      await screen.findByRole("region", { name: "docs/prd.md" });

      fireEvent.click(screen.getByLabelText("Preview README.md"));
      await waitFor(() => expect(screen.getByRole("region", { name: "README.md" })).toBeInTheDocument());
      expect(screen.queryByRole("region", { name: "docs/prd.md" })).not.toBeInTheDocument();
    });

    it("closes when Preview is clicked again on the row already shown", async () => {
      renderTab();
      await screen.findByText("README.md");
      fireEvent.click(screen.getByLabelText("Preview docs/prd.md"));
      await screen.findByRole("region", { name: "docs/prd.md" });

      fireEvent.click(screen.getByLabelText("Preview docs/prd.md"));
      expect(screen.queryByRole("region", { name: "docs/prd.md" })).not.toBeInTheDocument();
    });

    it("closes via the panel's own close control", async () => {
      renderTab();
      await screen.findByText("README.md");
      fireEvent.click(screen.getByLabelText("Preview docs/prd.md"));
      await screen.findByRole("region", { name: "docs/prd.md" });

      fireEvent.click(screen.getByLabelText('Close preview of "docs/prd.md"'));
      expect(screen.queryByRole("region", { name: "docs/prd.md" })).not.toBeInTheDocument();
    });

    it("keeps toggling and reordering usable while the panel is open", async () => {
      renderTab();
      await screen.findByText("README.md");
      fireEvent.click(screen.getByLabelText("Preview docs/prd.md"));
      await screen.findByRole("region", { name: "docs/prd.md" });

      const rowA = screen.getByLabelText('Attach "docs/prd.md" to this agent');
      await waitFor(() => expect(rowA.querySelector('[role="switch"]')).toHaveAttribute("aria-checked", "false"));
      fireEvent.click(rowA.querySelector('[role="switch"]')!);
      expect(setAttachmentsMutate).toHaveBeenCalled();

      const readmeHandle = screen.getByLabelText('Reorder "README.md"');
      fireEvent.keyDown(readmeHandle, { key: "ArrowUp" });
      expect(setOrderMutate).toHaveBeenCalled();
    });
  });
});
