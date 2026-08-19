import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, ProjectContextDoc, ProjectContextDocDetail, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/context.json";

const agentsQuery = vi.hoisted(() => ({ current: { data: [] as Agent[] } }));
const skillsQuery = vi.hoisted(() => ({ current: { data: [] as Skill[] } }));
const docQuery = vi.hoisted(() => ({
  current: { data: undefined as ProjectContextDocDetail | undefined, isLoading: false, isError: false },
}));

vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => agentsQuery.current }));
vi.mock("@/lib/hooks/skills", () => ({ useSkills: () => skillsQuery.current }));
vi.mock("@/lib/hooks/core", () => ({
  useProjectContextDoc: () => docQuery.current,
  useSetContextAttachments: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

import { DocViewer } from "./DocViewer";

afterEach(cleanup);

function renderViewer(docs: ProjectContextDoc[], selectedPath: string | null) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <div data-theme="dark">
          <DocViewer repoId="repo-1" docs={docs} selectedPath={selectedPath} />
        </div>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const DOC: ProjectContextDoc = {
  path: "docs/prd.md",
  size: 1000,
  tokens: 200,
  agent_count: 1,
  skill_count: 0,
  missing: false,
  too_large: false,
};

describe("DocViewer — selection states", () => {
  it("shows the select prompt when nothing is selected", () => {
    renderViewer([DOC], null);
    expect(screen.getByText(/Select a document/)).toBeInTheDocument();
  });

  it("shows 'not found in this repo' for a deep-linked path that isn't discovered (C10)", () => {
    renderViewer([DOC], "does/not/exist.md");
    expect(screen.getByText("Not found in this repo")).toBeInTheDocument();
    expect(screen.getByText(/does\/not\/exist\.md/)).toBeInTheDocument();
  });
});

describe("DocViewer — read-only body (D1)", () => {
  it("renders the document read-only, with no Preview/Edit toggle", () => {
    docQuery.current = {
      data: {
        path: DOC.path,
        content: "# Hello",
        tokens: 200,
        attachments: [],
        github_url: "https://github.com/acme/repo/blob/main/docs/prd.md",
        missing: false,
      },
      isLoading: false,
      isError: false,
    };
    renderViewer([DOC], DOC.path);
    expect(screen.getByText("Open on GitHub")).toBeInTheDocument();
    expect(screen.queryByText("preview")).not.toBeInTheDocument();
    expect(screen.queryByText("edit")).not.toBeInTheDocument();
  });
});

describe("DocViewer — a missing document keeps its tabs usable (C8, R10)", () => {
  it("shows the 'no longer in the repository' body but Skills/Agents tabs still switch", () => {
    const missingDoc: ProjectContextDoc = { ...DOC, missing: true };
    docQuery.current = {
      data: { path: DOC.path, content: "", tokens: null, attachments: [], github_url: null, missing: true },
      isLoading: false,
      isError: false,
    };
    renderViewer([missingDoc], DOC.path);
    expect(screen.getByText("No longer in the repository")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Skills"));
    expect(screen.getByText("No skills in this workspace yet.")).toBeInTheDocument();
  });
});

describe("DocViewer — a load failure keeps the tabs usable (module interaction table)", () => {
  it("shows the doc load error on the Document tab and still switches to Agents", () => {
    docQuery.current = { data: undefined, isLoading: false, isError: true };
    renderViewer([DOC], DOC.path);
    expect(screen.getByText("Couldn't load this document")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Agents"));
    expect(screen.getByText("No agents in this workspace yet.")).toBeInTheDocument();
  });
});

describe("DocViewer — 'Used by N agents' click-through (D2)", () => {
  it("switches to the Agents tab", () => {
    docQuery.current = {
      data: { path: DOC.path, content: "# Hi", tokens: 200, attachments: [], github_url: null, missing: false },
      isLoading: false,
      isError: false,
    };
    renderViewer([DOC], DOC.path);
    fireEvent.click(screen.getByText(/Used by/));
    expect(screen.getByText("No agents in this workspace yet.")).toBeInTheDocument();
  });
});
