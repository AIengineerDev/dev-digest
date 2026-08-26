import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { TourRecord } from "@devdigest/shared";
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
