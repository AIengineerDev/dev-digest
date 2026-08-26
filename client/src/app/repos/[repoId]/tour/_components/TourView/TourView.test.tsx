import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingSection, OnboardingSectionKind, TourRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";

const tourQuery = vi.hoisted(() => ({
  current: {
    data: undefined as TourRecord | null | undefined,
    isLoading: false,
    isError: false,
    error: null as Error | null,
  },
}));
const generateMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as Error | null,
}));
const indexStatusQuery = vi.hoisted(() => ({
  current: {
    data: {
      status: "full" as "full" | "partial" | "degraded" | "failed",
      filesIndexed: 120,
      filesSkipped: 0,
      lastIndexedSha: "deadbeefcafe",
      updatedAt: "2026-08-20T00:00:00.000Z",
    } as
      | {
          status: "full" | "partial" | "degraded" | "failed";
          filesIndexed: number;
          filesSkipped: number;
          lastIndexedSha: string;
          updatedAt: string;
        }
      | undefined,
    isLoading: false,
  },
}));
const resyncMutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1" }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "repo1", full_name: "acme/payments-api" }] }),
}));
vi.mock("@/lib/hooks", () => ({
  useTour: () => ({ ...tourQuery.current, refetch: vi.fn() }),
  useGenerateTour: () => generateMutation,
  useRepoIntelStatus: () => indexStatusQuery.current,
  useResyncRepoIntel: () => resyncMutation,
}));

import { TourView } from "./TourView";

afterEach(() => {
  cleanup();
  generateMutation.mutate.mockClear();
  generateMutation.isPending = false;
  generateMutation.isError = false;
  generateMutation.error = null;
  resyncMutation.mutate.mockClear();
  resyncMutation.isPending = false;
  tourQuery.current = { data: undefined, isLoading: false, isError: false, error: null };
  indexStatusQuery.current = {
    data: {
      status: "full",
      filesIndexed: 120,
      filesSkipped: 0,
      lastIndexedSha: "deadbeefcafe",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
    isLoading: false,
  };
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <TourView />
    </NextIntlClientProvider>,
  );
}

describe("TourView — non-populated states (Phase B1)", () => {
  it("renders skeleton rows while the tour query or the index-status query is loading", () => {
    tourQuery.current = { data: undefined, isLoading: true, isError: false, error: null };
    const { container } = renderView();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders the load-error branch on a query error, not the not-indexed or CTA branch (A13)", () => {
    tourQuery.current = { data: undefined, isLoading: false, isError: true, error: new Error("engine unreachable") };
    renderView();
    expect(screen.getByText("Couldn’t load the onboarding tour")).toBeInTheDocument();
    expect(screen.queryByText(/Generate onboarding tour/)).not.toBeInTheDocument();
  });

  it("renders the not-indexed explanation with a disabled Generate when index status is 'failed' (A12)", () => {
    tourQuery.current = { data: null, isLoading: false, isError: false, error: null };
    indexStatusQuery.current = {
      data: { status: "failed", filesIndexed: 0, filesSkipped: 0, lastIndexedSha: "", updatedAt: "" },
      isLoading: false,
    };
    renderView();
    expect(screen.getByText("This repository isn’t indexed yet")).toBeInTheDocument();
    const generateBtn = screen.getByRole("button", { name: /Generate onboarding tour/ });
    expect(generateBtn).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Resync/ }));
    expect(resyncMutation.mutate).toHaveBeenCalled();
  });

  it("also treats a never-indexed repo (no row → degraded/no_data synthesized state) as not-indexed", () => {
    tourQuery.current = { data: null, isLoading: false, isError: false, error: null };
    indexStatusQuery.current = {
      data: { status: "degraded", filesIndexed: 0, filesSkipped: 0, lastIndexedSha: "", updatedAt: "" },
      isLoading: false,
    };
    renderView();
    expect(screen.getByText("This repository isn’t indexed yet")).toBeInTheDocument();
  });

  it("renders the generate CTA with the token/time estimate when no tour exists yet (A13)", () => {
    tourQuery.current = { data: null, isLoading: false, isError: false, error: null };
    renderView();
    expect(screen.getAllByText("Generate onboarding tour").length).toBeGreaterThan(0);
    expect(screen.getByText(/Up to ~12,000 tokens, 30–60s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Generate onboarding tour/ }));
    expect(generateMutation.mutate).toHaveBeenCalledWith(false);
  });

  it("renders every string through the onboarding.* namespace — a missing key throws (A20)", () => {
    tourQuery.current = { data: null, isLoading: false, isError: false, error: null };
    expect(() =>
      render(
        <NextIntlClientProvider
          locale="en"
          messages={{ onboarding: {} }}
          onError={(err) => {
            throw err;
          }}
        >
          <TourView />
        </NextIntlClientProvider>,
      ),
    ).toThrow();
  });
});

function baseSection(kind: OnboardingSectionKind, title: string, over: Partial<OnboardingSection> = {}): OnboardingSection {
  return {
    kind,
    title,
    body: `${title} body.`,
    diagram: null,
    links: [],
    ...over,
  };
}

function fullTour(overrides: Partial<TourRecord> = {}, sectionOverrides: Partial<Record<OnboardingSectionKind, Partial<OnboardingSection>>> = {}): TourRecord {
  const sections: OnboardingSection[] = [
    baseSection("architecture_overview", "Architecture overview", {
      tree: [{ path: "src/api", files: 4, role_mix: { core: 3, test: 1 }, top_file: "src/api/index.ts", note: "Entry point." }],
      ...sectionOverrides.architecture_overview,
    }),
    baseSection("critical_paths", "Critical paths", {
      paths: [
        {
          chain_id: "c1",
          files: ["src/server.ts", "src/api/index.ts"],
          endpoints: ["GET /health"],
          why: "Bootstraps every request.",
          resolved: [true, true],
        },
      ],
      ...sectionOverrides.critical_paths,
    }),
    baseSection("how_to_run", "How to run locally", {
      run_steps: [
        { command: "pnpm install", why: "Install dependencies." },
        { command: "pnpm dev", why: null },
      ],
      ...sectionOverrides.how_to_run,
    }),
    baseSection("guided_reading", "Guided reading path", {
      reading: [
        { path: "src/server.ts", why: "Start here.", rank_percentile: 95, resolved: true },
        { path: "src/api/index.ts", why: "Public surface.", rank_percentile: 80, resolved: true },
      ],
      ...sectionOverrides.guided_reading,
    }),
    baseSection("first_tasks", "First tasks", {
      tasks: [
        {
          candidate_id: "t1",
          title: "Add a health probe",
          scope: "src/api/health.ts",
          why: "Missing readiness check.",
          difficulty: "high",
          difficulty_basis: { callers: 20, rank_percentile: 95, signal: "indexed" },
          resolved: true,
        },
        {
          candidate_id: "t2",
          title: "Document webhooks",
          scope: "specs/",
          why: null,
          difficulty: "low",
          difficulty_basis: { callers: 1, rank_percentile: 12, signal: "indexed" },
          resolved: true,
        },
      ],
      ...sectionOverrides.first_tasks,
    }),
  ];

  return {
    sections,
    repo_id: "repo1",
    indexed_sha: "deadbeefcafe",
    indexer_version: 2,
    prompt_version: "1",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    trace: {
      budget_tokens: 8000,
      tokens_in: 7000,
      tokens_out: 900,
      cost_usd: 0.01,
      provider: "anthropic",
      model: "claude-haiku-4-5",
      prompt_version: "1",
    },
    degraded: false,
    error: null,
    skeleton_sections: [],
    dropped_inputs: [],
    dropped_refs: 0,
    dropped_steps: 0,
    index_status: "full",
    files_skipped: 0,
    current_indexed_sha: "deadbeefcafe",
    generated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("TourView — populated (Phase B2)", () => {
  it("renders all five sections in fixed order with one rail anchor per kind (A14)", () => {
    tourQuery.current = { data: fullTour(), isLoading: false, isError: false, error: null };
    const { container } = renderView();

    const sectionIds = [...container.querySelectorAll("section[id]")].map((el) => el.id);
    expect(sectionIds).toEqual([
      "architecture_overview",
      "critical_paths",
      "how_to_run",
      "guided_reading",
      "first_tasks",
    ]);

    const anchors = [...container.querySelectorAll("nav a[href^='#']")].map((el) => el.getAttribute("href"));
    expect(anchors).toEqual(["#architecture_overview", "#critical_paths", "#how_to_run", "#guided_reading", "#first_tasks"]);
  });

  it("renders no diagram container when diagram is null (A21, C4)", () => {
    tourQuery.current = {
      data: fullTour({}, { architecture_overview: { diagram: null } }),
      isLoading: false,
      isError: false,
      error: null,
    };
    const { container } = renderView();
    // ArchitectureSection never mounts MermaidDiagram for a null chart, so the
    // only svgs in the section are its own header icon + chevron (2) — not a
    // third, empty diagram box. Scoped to the section: header icons elsewhere
    // on the page (e.g. Regenerate) would otherwise confuse a page-wide count.
    const architectureSection = container.querySelector("#architecture_overview")!;
    expect(architectureSection.querySelectorAll("svg")).toHaveLength(2);
  });

  it("renders nothing and does not throw for an unparseable diagram string (A21, C10)", () => {
    tourQuery.current = {
      data: fullTour({}, { architecture_overview: { diagram: "flowchart LR\nA[[broken" } }),
      isLoading: false,
      isError: false,
      error: null,
    };
    expect(() => renderView()).not.toThrow();
  });

  it("renders a named empty message per section, never an empty card (A23)", () => {
    tourQuery.current = {
      data: fullTour(
        {},
        {
          critical_paths: { paths: [], empty_reason: "no dependency chains found — the import graph is empty or too shallow" },
          how_to_run: { run_steps: [], body: null, empty_reason: "no runnable configuration found in this repository" },
          first_tasks: { tasks: [], empty_reason: "nothing obvious to start on — this repository is unusually tidy" },
        },
      ),
      isLoading: false,
      isError: false,
      error: null,
    };
    renderView();
    expect(screen.getByText(/no dependency chains found/)).toBeInTheDocument();
    expect(screen.getByText(/no runnable configuration found/)).toBeInTheDocument();
    expect(screen.getByText(/nothing obvious to start on/)).toBeInTheDocument();
    // The other two sections are unaffected and still render their content.
    expect(screen.getByText("Start here.")).toBeInTheDocument();
  });

  it("skeletonizes only the named section — its facts render without why, the rest render in full (A26, C14)", () => {
    tourQuery.current = {
      data: fullTour(
        { skeleton_sections: ["how_to_run"], degraded: true, error: "malformed_response" },
        { how_to_run: { body: null, skeleton: true, run_steps: [{ command: "pnpm install", why: null }] } },
      ),
      isLoading: false,
      isError: false,
      error: null,
    };
    renderView();
    expect(screen.getByText("No summary generated")).toBeInTheDocument();
    expect(screen.getByText("pnpm install")).toBeInTheDocument();
    // The other four sections still show real prose.
    expect(screen.getByText("Start here.")).toBeInTheDocument();
    expect(screen.getByText("Bootstraps every request.")).toBeInTheDocument();
  });

  it("a fully-skeletonised record renders every derived collection plus one top status banner — content, not an error card (A9)", () => {
    const allSkeleton: Partial<Record<OnboardingSectionKind, Partial<OnboardingSection>>> = {
      architecture_overview: { body: null, skeleton: true },
      critical_paths: { body: null, skeleton: true },
      how_to_run: { body: null, skeleton: true },
      guided_reading: { body: null, skeleton: true },
      first_tasks: { body: null, skeleton: true },
    };
    tourQuery.current = {
      data: fullTour(
        {
          skeleton_sections: [
            "architecture_overview",
            "critical_paths",
            "how_to_run",
            "guided_reading",
            "first_tasks",
          ],
          degraded: true,
          error: "no provider key configured",
        },
        allSkeleton,
      ),
      isLoading: false,
      isError: false,
      error: null,
    };
    renderView();

    // One status banner naming the failure, not five.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText(/no provider key configured/)).toBeInTheDocument();

    // Every derived collection is still content, not an error card.
    expect(screen.getByText("src/api")).toBeInTheDocument(); // tree
    expect(screen.getAllByText("src/server.ts").length).toBeGreaterThan(0); // critical-path + reading, both resolved
    expect(screen.getByText("pnpm install")).toBeInTheDocument(); // run step
    expect(screen.getByText("Add a health probe")).toBeInTheDocument(); // task
  });

  it("wraps six tasks into a grid, ascending difficulty first (C8)", () => {
    const tasks = ["high", "medium", "low", "high", "medium", "low"].map((difficulty, i) => ({
      candidate_id: `t${i}`,
      title: `Task ${i}`,
      scope: `src/file${i}.ts`,
      why: null,
      difficulty: difficulty as "low" | "medium" | "high",
      difficulty_basis: { callers: 1, rank_percentile: 10, signal: "indexed" as const },
      resolved: true,
    }));
    tourQuery.current = {
      data: fullTour({}, { first_tasks: { tasks } }),
      isLoading: false,
      isError: false,
      error: null,
    };
    renderView();
    const titles = screen.getAllByText(/^Task \d$/).map((el) => el.textContent);
    expect(titles).toEqual(["Task 2", "Task 5", "Task 1", "Task 4", "Task 0", "Task 3"]);
  });
});
