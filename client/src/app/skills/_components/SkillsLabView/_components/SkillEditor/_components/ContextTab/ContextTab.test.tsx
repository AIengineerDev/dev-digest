import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProjectContextDoc, ProjectContextDocDetail, Repo } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";

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

const DOC_A: ProjectContextDoc = {
  path: "docs/prd.md",
  size: 500,
  tokens: 100,
  agent_count: 1,
  skill_count: 0,
  missing: false,
  too_large: false,
};
const DOC_B: ProjectContextDoc = { ...DOC_A, path: "docs/style-guide.md" };

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
const detailByPath = vi.hoisted(
  () => new Map<string, ProjectContextDocDetail>(),
);

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => activeRepo.current }));
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => filesQuery.current,
  useSetContextAttachments: () => ({ mutate: setAttachmentsMutate, isPending: false, variables: undefined }),
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
    data: { docs: [DOC_A, DOC_B], truncated: false, limit: 1000, total_tokens: 200 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  setAttachmentsMutate.mockClear();
  detailByPath.clear();
  detailByPath.set(DOC_A.path, {
    path: DOC_A.path,
    content: "# PRD",
    tokens: 100,
    attachments: [{ target_kind: "agent", target_id: "agent-1" }],
    github_url: null,
    missing: false,
  });
  detailByPath.set(DOC_B.path, {
    path: DOC_B.path,
    content: "# Style",
    tokens: 80,
    attachments: [{ target_kind: "skill", target_id: "sk-1" }],
    github_url: null,
    missing: false,
  });
});

function renderTab(skillId = "sk-1") {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ContextTab skillId={skillId} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ContextTab", () => {
  it("lists documents for the active repo and reflects attachment state per row", async () => {
    renderTab();
    expect(await screen.findByText("docs/prd.md")).toBeInTheDocument();
    expect(screen.getByText("docs/style-guide.md")).toBeInTheDocument();
    expect(screen.getByText("Documents in acme/widgets")).toBeInTheDocument();

    const rowA = screen.getByLabelText('Attach "docs/prd.md" to this skill');
    const rowB = screen.getByLabelText('Attach "docs/style-guide.md" to this skill');
    // sk-1 is attached to doc B (skill target) but not doc A (only an agent
    // target there) — the toggle must read from the document's OWN detail,
    // not from any shared/global flag.
    await waitFor(() => expect(rowA.querySelector('[role="switch"]')).toHaveAttribute("aria-checked", "false"));
    await waitFor(() => expect(rowB.querySelector('[role="switch"]')).toHaveAttribute("aria-checked", "true"));
  });

  it("attaching a document preserves that document's OTHER attachments (agents and other skills)", async () => {
    renderTab("sk-1");
    await screen.findByText("docs/prd.md");
    const rowA = screen.getByLabelText('Attach "docs/prd.md" to this skill');
    // The row's detail (and its current attachments) load asynchronously; the
    // toggle stays disabled until then (helpers.ts:nextTargets), so wait for
    // it to reflect the "off" state before clicking.
    await waitFor(() => expect(rowA.querySelector('[role="switch"]')).toHaveAttribute("aria-checked", "false"));
    fireEvent.click(rowA.querySelector('[role="switch"]')!);

    // Doc A already carries an agent attachment — turning this skill ON must
    // append to that set, not replace it (this is the "N calls preserve other
    // attachments" hazard the PR brief calls out).
    expect(setAttachmentsMutate).toHaveBeenCalledWith(
      {
        path: "docs/prd.md",
        targets: [
          { target_kind: "agent", target_id: "agent-1" },
          { target_kind: "skill", target_id: "sk-1" },
        ],
      },
      expect.anything(),
    );
  });

  it("toggling one document never touches another document's write", async () => {
    renderTab("sk-1");
    await screen.findByText("docs/prd.md");
    const rowA = screen.getByLabelText('Attach "docs/prd.md" to this skill');
    await waitFor(() => expect(rowA.querySelector('[role="switch"]')).toHaveAttribute("aria-checked", "false"));
    fireEvent.click(rowA.querySelector('[role="switch"]')!);

    expect(setAttachmentsMutate).toHaveBeenCalledTimes(1);
    expect(setAttachmentsMutate).toHaveBeenCalledWith(
      expect.objectContaining({ path: "docs/prd.md" }),
      expect.anything(),
    );
  });

  it("detaching preserves sibling skill/agent attachments on the same document", async () => {
    detailByPath.set(DOC_B.path, {
      path: DOC_B.path,
      content: "# Style",
      tokens: 80,
      attachments: [
        { target_kind: "skill", target_id: "sk-1" },
        { target_kind: "skill", target_id: "sk-2" },
        { target_kind: "agent", target_id: "agent-1" },
      ],
      github_url: null,
      missing: false,
    });
    renderTab("sk-1");
    await screen.findByText("docs/style-guide.md");
    const rowB = screen.getByLabelText('Attach "docs/style-guide.md" to this skill');
    await waitFor(() => expect(rowB.querySelector('[role="switch"]')).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(rowB.querySelector('[role="switch"]')!);

    expect(setAttachmentsMutate).toHaveBeenCalledWith(
      {
        path: "docs/style-guide.md",
        targets: [
          { target_kind: "skill", target_id: "sk-2" },
          { target_kind: "agent", target_id: "agent-1" },
        ],
      },
      expect.anything(),
    );
  });

  it("blocks the toggle for an over-the-limit document", async () => {
    filesQuery.current = {
      ...filesQuery.current,
      data: { docs: [{ ...DOC_A, too_large: true }], truncated: false, limit: 1000, total_tokens: 200 },
    };
    renderTab();
    expect(await screen.findByText("over the attach size limit")).toBeInTheDocument();
    const row = screen.getByLabelText('Attach "docs/prd.md" to this skill');
    expect(row).toHaveStyle({ pointerEvents: "none" });
  });

  it("shows the no-repo state when no repo is active", () => {
    activeRepo.current = { repoId: null, activeRepo: null, reposLoaded: true };
    renderTab();
    expect(
      screen.getByText("Connect a repo to attach project-context documents to this skill."),
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
});
