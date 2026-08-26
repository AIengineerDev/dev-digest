import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";

const briefQuery = vi.hoisted(() => ({
  current: {
    data: undefined as BriefRecord | null | undefined,
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
vi.mock("../../../../../../../lib/hooks", () => ({
  useBrief: () => ({ ...briefQuery.current, refetch: vi.fn() }),
  useGenerateBrief: () => generateMutation,
}));

import { PrBriefCard } from "./PrBriefCard";

afterEach(() => {
  cleanup();
  generateMutation.mutate.mockClear();
  generateMutation.isPending = false;
  generateMutation.isError = false;
  generateMutation.error = null;
  briefQuery.current = { data: undefined, isLoading: false, isError: false, error: null };
});

function brief(over: Partial<BriefRecord> = {}): BriefRecord {
  return {
    pr_id: "pr1",
    head_sha: "abc1234",
    intent_fingerprint: "fp1",
    repo_indexed_sha: "def5678",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    prompt_version: 1,
    tokens_in: 3000,
    tokens_out: 400,
    cost_usd: 0.002,
    budget_tokens: 8000,
    dropped_inputs: [],
    dropped_refs: 0,
    degraded: false,
    error: null,
    generated_at: "2026-08-17T10:00:00.000Z",
    what: "Adds rate limiting to the public webhook routes.",
    why: "Prevents abuse of the unauthenticated callback endpoint.",
    risk_level: "medium",
    risks: [],
    review_focus: [],
    ...over,
  } as BriefRecord;
}

function review(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: "Agent",
    head_sha: "head1",
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 80,
    model: null,
    grounding: null,
    created_at: "2026-08-17T10:00:00Z",
    findings: [],
    ...over,
  } as ReviewRecord;
}

function renderCard(props: Partial<Parameters<typeof PrBriefCard>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <PrBriefCard prId="pr1" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("PrBriefCard", () => {
  it("renders nothing while the brief query is still in flight", () => {
    briefQuery.current = { data: undefined, isLoading: true, isError: false, error: null };
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the error branch, not the empty branch, on a query error", () => {
    // The RunReviewDropdown defect: isLoading false, data undefined, isError
    // true must not fall through into the "not generated" empty state.
    briefQuery.current = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("engine unreachable"),
    };
    renderCard();
    expect(screen.getByText("Couldn't load the brief")).toBeInTheDocument();
    expect(screen.queryByText(/Brief not available yet/)).not.toBeInTheDocument();
  });

  it("offers to generate when there is no brief yet (A8)", () => {
    briefQuery.current = { data: null, isLoading: false, isError: false, error: null };
    renderCard();
    expect(screen.getByText(/Brief not available yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Generate brief/ }));
    expect(generateMutation.mutate).toHaveBeenCalledWith(false);
  });

  it("says why generating failed instead of doing nothing", () => {
    briefQuery.current = { data: null, isLoading: false, isError: false, error: null };
    generateMutation.isError = true;
    generateMutation.error = new Error("no provider key configured");
    renderCard();
    expect(screen.getByText(/no provider key configured/)).toBeInTheDocument();
  });

  it("a degraded record shows the error and Retry sends force:true (A10, A-2)", () => {
    briefQuery.current = {
      data: brief({ degraded: true, error: "model timed out", cost_usd: null }),
      isLoading: false,
      isError: false,
      error: null,
    };
    renderCard();
    expect(screen.getByText(/Not generated — model timed out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(generateMutation.mutate).toHaveBeenCalledWith(true);
  });

  it("renders every string through the brief.* namespace — a missing key fails", () => {
    // Simulates A16: rendering without the `brief` namespace loaded must throw
    // rather than silently print the key path.
    briefQuery.current = { data: null, isLoading: false, isError: false, error: null };
    expect(() =>
      render(
        <NextIntlClientProvider
          locale="en"
          messages={{ brief: {} }}
          onError={(err) => {
            throw err;
          }}
        >
          <PrBriefCard prId="pr1" />
        </NextIntlClientProvider>,
      ),
    ).toThrow();
  });

  it("renders the populated card: badge, what, why, and risk pills (A7)", () => {
    briefQuery.current = {
      data: brief({
        risk_level: "high",
        risks: [
          { kind: "security", title: "SSRF risk", explanation: "Unvalidated callback URL", severity: "high", file_refs: [] },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
    };
    renderCard();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText(/Adds rate limiting/)).toBeInTheDocument();
    expect(screen.getByText(/Prevents abuse/)).toBeInTheDocument();
    expect(screen.getByText("SSRF risk")).toBeInTheDocument();
  });

  it("renders brief.noRisks for an empty, non-degraded risks array (C2)", () => {
    briefQuery.current = { data: brief({ risks: [] }), isLoading: false, isError: false, error: null };
    renderCard();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });

  it("shows 8 risks and a +7 more disclosure for 15 risks (C3)", () => {
    const risks = Array.from({ length: 15 }, (_, i) => ({
      kind: "correctness",
      title: `Risk ${i}`,
      explanation: "x",
      severity: "low" as const,
      file_refs: [],
    }));
    briefQuery.current = { data: brief({ risks }), isLoading: false, isError: false, error: null };
    renderCard();
    expect(screen.getAllByText(/^Risk \d+$/)).toHaveLength(8);
    expect(screen.getByText("+7 more")).toBeInTheDocument();
  });

  it("a risk with an unknown kind renders a fallback icon and its raw label, without throwing (A17)", () => {
    // `Risk.kind` is free-form model text (Q5), so the fixture must use a kind
    // that is NOT in `RISK_ICON` — a mapped one exercises the happy path and
    // says nothing about the fallback this test is named for.
    briefQuery.current = {
      data: brief({
        risks: [
          {
            kind: "quantum_entanglement",
            title: "Race condition",
            explanation: "x",
            severity: "medium",
            file_refs: [],
          },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
    };
    expect(() => renderCard()).not.toThrow();
    expect(screen.getByText("Race condition")).toBeInTheDocument();
    // The raw kind survives: an unmapped icon must not silently erase the
    // model's own claim about what kind of risk this is.
    expect(screen.getByText("quantum_entanglement")).toBeInTheDocument();
  });

  it("R8 — a risk pill is a disclosure: explanation and file_refs appear on expand", () => {
    briefQuery.current = {
      data: brief({
        risks: [
          {
            kind: "security",
            title: "Token forwarded to a caller-controlled URL",
            explanation: "The webhook handler forwards the account token to req.body.callback_url.",
            severity: "high",
            file_refs: ["src/api/public/webhooks.ts", "src/config.ts"],
          },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
    };
    renderCard();

    // Collapsed: the claim is visible, its evidence is not.
    const toggle = screen.getByRole("button", { expanded: false });
    expect(screen.queryByText(/forwards the account token/)).not.toBeInTheDocument();
    expect(screen.queryByText("src/api/public/webhooks.ts")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(screen.getByText(/forwards the account token/)).toBeInTheDocument();
    expect(screen.getByText("src/api/public/webhooks.ts")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
  });

  it("R8 — a risk file ref jumps to that file in the diff, like a review-focus entry", () => {
    const onFocusFile = vi.fn();
    briefQuery.current = {
      data: brief({
        risks: [
          {
            kind: "security",
            title: "Plaintext key",
            explanation: "A live Stripe key is committed.",
            severity: "high",
            file_refs: ["src/config.ts"],
          },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
    };
    renderCard({ onFocusFile });

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByText("src/config.ts"));

    // `groundBrief` already guaranteed this path is a file the PR changed, so
    // the jump target cannot be dead.
    expect(onFocusFile).toHaveBeenCalledWith("src/config.ts");
  });

  it("middle-truncates a long `what` and keeps the full text in a title attribute (C4)", () => {
    const longWhat = "A".repeat(400);
    briefQuery.current = { data: brief({ what: longWhat }), isLoading: false, isError: false, error: null };
    renderCard();
    const el = screen.getByTitle(longWhat);
    expect(el.textContent!.length).toBeLessThan(400);
    expect(el.textContent).toContain("…");
  });

  it("keeps the cached brief on screen while a mutation is pending, and disables Regenerate (A9, C5)", () => {
    briefQuery.current = { data: brief(), isLoading: false, isError: false, error: null };
    generateMutation.isPending = true;
    renderCard();
    expect(screen.getByText(/Adds rate limiting/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeDisabled();
  });

  it("disables Regenerate when the state is unchanged and the row is healthy (C10)", () => {
    briefQuery.current = {
      data: brief({ head_sha: "head1" }),
      isLoading: false,
      isError: false,
      error: null,
    };
    renderCard({ headSha: "head1" });
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeDisabled();
  });

  it("moved head_sha renders a stale marker with the 7-char sha and enables Regenerate, without firing a mutation on rerender (A14)", () => {
    briefQuery.current = {
      data: brief({ head_sha: "oldhead1234" }),
      isLoading: false,
      isError: false,
      error: null,
    };
    const { rerender } = renderCard({ headSha: "newhead5678" });
    expect(screen.getByText(/oldhead/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate/ })).not.toBeDisabled();
    expect(generateMutation.mutate).not.toHaveBeenCalled();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
        <PrBriefCard prId="pr1" headSha="newhead5678" />
      </NextIntlClientProvider>,
    );
    expect(generateMutation.mutate).not.toHaveBeenCalled();
  });

  it("counts row: the newest review being empty still reports the other agent's findings, and reads the min score (A12)", () => {
    briefQuery.current = { data: brief({ head_sha: "head1" }), isLoading: false, isError: false, error: null };
    const reviews: ReviewRecord[] = [
      review({
        id: "old-empty",
        agent_name: "Newest",
        created_at: "2026-08-17T12:00:00Z",
        score: 95,
        findings: [],
      }),
      review({
        id: "other",
        agent_name: "Other",
        created_at: "2026-08-17T10:00:00Z",
        score: 40,
        findings: [
          {
            id: "f1",
            severity: "CRITICAL",
            category: "security",
            title: "x",
            file: "a.ts",
            start_line: 1,
            end_line: 1,
            rationale: "",
            suggestion: null,
            confidence: 0.9,
            kind: "finding",
            trifecta_components: null,
            evidence: null,
            review_id: "other",
            accepted_at: null,
            dismissed_at: null,
          },
        ],
      }),
    ];
    renderCard({ reviews, headSha: "head1" });
    expect(screen.getByText("SCORE 40")).toBeInTheDocument();
    expect(screen.getByText("1 blocker")).toBeInTheDocument();
  });

  it("reads 'not reviewed yet' when no review is at head, never '0 findings' (A12)", () => {
    briefQuery.current = { data: brief({ head_sha: "head1" }), isLoading: false, isError: false, error: null };
    renderCard({ reviews: [], headSha: "head1" });
    expect(screen.getByText("Not reviewed yet")).toBeInTheDocument();
    expect(screen.queryByText(/0 findings/)).not.toBeInTheDocument();
  });

  it("shows the missing-inputs line from dropped_inputs", () => {
    briefQuery.current = {
      data: brief({ dropped_inputs: ["linked_issue:unreachable"] }),
      isLoading: false,
      isError: false,
      error: null,
    };
    renderCard();
    expect(screen.getByText(/Generated without linked_issue:unreachable/)).toBeInTheDocument();
  });

  it("renders the review-focus list, ordered list markup, and truncates a long ref (C4)", () => {
    const longPath = "src/" + "a".repeat(180) + "/x.ts";
    briefQuery.current = {
      data: brief({
        review_focus: [
          { kind: "file", ref: longPath, reason: "touches the auth boundary", line: null },
          { kind: "endpoint", ref: "POST /webhooks/callback", reason: "no auth check", line: null },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
    };
    const onFocusFile = vi.fn();
    renderCard({ onFocusFile });
    expect(screen.getByText(/touches the auth boundary/)).toBeInTheDocument();
    const fileButton = screen.getByRole("button", { name: new RegExp(`^src/a{1,}`) });
    expect(fileButton.textContent!.length).toBeLessThan(longPath.length);
    fireEvent.click(fileButton);
    expect(onFocusFile).toHaveBeenCalledWith(longPath);
    // The endpoint entry renders as plain text, not an interactive element.
    expect(screen.queryByRole("button", { name: /webhooks\/callback/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /webhooks\/callback/ })).not.toBeInTheDocument();
  });
});
