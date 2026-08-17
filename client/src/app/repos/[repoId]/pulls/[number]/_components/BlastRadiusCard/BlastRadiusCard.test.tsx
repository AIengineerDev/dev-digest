import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import blast from "../../../../../../../../messages/en/blast.json";

const query = vi.hoisted(() => ({
  current: { data: undefined as BlastRadius | undefined, isLoading: false, isError: false },
}));
vi.mock("@/lib/hooks", () => ({
  useBlastRadius: () => ({ ...query.current, error: null, refetch: vi.fn() }),
}));

import { BlastRadiusCard } from "./BlastRadiusCard";
import { isEmpty, layout, totals } from "./helpers";

afterEach(cleanup);

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" },
    { name: "bucketKey", file: "src/middleware/ratelimit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "boot", file: "src/server.ts", line: 40 },
        { name: "mount", file: "src/api/public/index.ts", line: 8 },
      ],
      endpoints_affected: ["POST /webhooks"],
      crons_affected: ["nightly-sweep"],
    },
    { symbol: "bucketKey", callers: [], endpoints_affected: ["POST /webhooks"], crons_affected: [] },
  ],
  summary: "2 changed symbols · 2 callers · 1 endpoint.",
};

const renderCard = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ blast }}>
      <div data-theme="dark">
        <BlastRadiusCard prId="pr-1" />
      </div>
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  query.current = { data: BLAST, isLoading: false, isError: false };
});

describe("BlastRadiusCard", () => {
  it("shows the three headline counts, plus crons only when there are any", () => {
    const { container } = renderCard();
    const stats = container.textContent!.replace(/\s+/g, " ");
    expect(stats).toContain("2 symbols");
    expect(stats).toContain("2 callers");
    expect(stats).toContain("1 endpoints");
    expect(stats).toContain("1 cron jobs");
  });

  it("omits the cron stat when nothing scheduled is downstream", () => {
    query.current = {
      data: { ...BLAST, downstream: BLAST.downstream.map((d) => ({ ...d, crons_affected: [] })) },
      isLoading: false,
      isError: false,
    };
    const { container } = renderCard();
    expect(container.textContent).not.toContain("cron jobs");
  });

  it("lists the changed symbols with their caller counts, most-called first", () => {
    renderCard();
    const rows = screen.getAllByRole("button", { expanded: false });
    expect(rows[0]).toHaveTextContent("rateLimit");
    expect(rows[0]).toHaveTextContent("2 callers");
    expect(rows[1]).toHaveTextContent("bucketKey");
    expect(rows[1]).toHaveTextContent("0 callers");
  });

  it("reveals the callers and endpoints of a symbol on click", () => {
    renderCard();
    fireEvent.click(screen.getByText("rateLimit"));
    expect(screen.getByText(/boot/)).toBeInTheDocument();
    expect(screen.getByText(/server\.ts:40/)).toBeInTheDocument();
    expect(screen.getByText("POST /webhooks")).toBeInTheDocument();
  });

  it("says so when a changed symbol has no callers, rather than showing nothing", () => {
    renderCard();
    fireEvent.click(screen.getByText("bucketKey"));
    expect(screen.getByText("Nothing calls this symbol.")).toBeInTheDocument();
  });

  it("renders the summary in every state — it carries the degraded explanation", () => {
    query.current = {
      data: {
        changed_symbols: [],
        downstream: [],
        summary: "No indexed symbols for the changed files. The repo index is unavailable, so this is a floor, not a finding.",
      },
      isLoading: false,
      isError: false,
    };
    renderCard();
    expect(screen.getByText(/a floor, not a finding/)).toBeInTheDocument();
    // Nothing to graph → no button offering to.
    expect(screen.queryByRole("button", { name: "Graph" })).not.toBeInTheDocument();
  });

  it("opens the graph in a dialog with its legend", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(screen.getByText("Changed symbol")).toBeInTheDocument();
    expect(screen.getByText("Endpoint")).toBeInTheDocument();
  });

  it("renders a loading state and an error state", () => {
    query.current = { data: undefined, isLoading: true, isError: false };
    const { unmount } = renderCard();
    unmount();

    query.current = { data: undefined, isLoading: false, isError: true };
    renderCard();
    expect(screen.getByText("Couldn't map this change")).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("deduplicates endpoints across symbols but not callers", () => {
    // POST /webhooks is reached via both symbols — that is ONE endpoint at
    // risk. Summing would inflate the scariest number on the card.
    expect(totals(BLAST)).toEqual({ symbols: 2, callers: 2, endpoints: 1, crons: 1 });
  });

  it("treats a result with no symbols and no downstream as empty", () => {
    expect(isEmpty({ changed_symbols: [], downstream: [], summary: "" })).toBe(true);
    expect(isEmpty(BLAST)).toBe(false);
  });

  it("lays the graph out deterministically — same input, same coordinates", () => {
    // Not a force simulation: a layout that settles somewhere new on each open
    // makes the picture impossible to talk about across two runs.
    const a = layout(BLAST);
    const b = layout(BLAST);
    expect(a).toEqual(b);
    expect(a.nodes.filter((n) => n.kind === "changed").map((n) => n.label)).toEqual([
      "rateLimit",
      "bucketKey",
    ]);
    // Two callers + one endpoint hang off rateLimit; one endpoint off bucketKey.
    expect(a.edges).toHaveLength(4);
  });

  it("still graphs a symbol with no impact when nothing else has any", () => {
    const orphan: BlastRadius = {
      changed_symbols: [{ name: "orphan", file: "src/a.ts", kind: "function" }],
      downstream: [{ symbol: "orphan", callers: [], endpoints_affected: [], crons_affected: [] }],
      summary: "1 changed symbol · 0 callers · 0 endpoints.",
    };
    expect(layout(orphan).nodes.map((n) => n.label)).toEqual(["orphan"]);
  });
});
