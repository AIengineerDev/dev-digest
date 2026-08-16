import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const derive = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock("../../../../../../../lib/hooks", () => ({
  useDeriveIntent: () => derive,
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  derive.mutate.mockClear();
});

function intent(over: Partial<PrIntentRecord> = {}): PrIntentRecord {
  return {
    pr_id: "pr1",
    intent: "Add rate limiting to the public API",
    in_scope: ["src/middleware/ratelimit.ts", "the public webhook routes"],
    out_of_scope: ["the billing service", "any change to auth"],
    category: "feature",
    summary: "Adds a token-bucket rate limiter in front of the public API.",
    confidence: 0.82,
    band: "high",
    sources: [{ kind: "pr_body", ref: null, grade: "documentation", used: true, note: null }],
    provider: "anthropic",
    model: "claude-haiku-4-5",
    prompt_version: 1,
    fingerprint: "abc123",
    derived_at: "2026-08-14T10:00:00.000Z",
    degraded: false,
    error: null,
    ...over,
  } as PrIntentRecord;
}

function renderCard(value: PrIntentRecord | null | undefined) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <IntentCard prId="pr1" intent={value} />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("renders nothing before the intent has been derived", () => {
    // `null` is a state, not an error: an empty card would claim the step ran.
    const { container } = renderCard(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders both scope columns with their entries", () => {
    renderCard(intent());
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("src/middleware/ratelimit.ts")).toBeInTheDocument();
    expect(screen.getByText("the billing service")).toBeInTheDocument();
  });

  it("keeps an empty column visible and says so", () => {
    // A column that disappears makes "the model claimed no boundary" look
    // exactly like "we never asked".
    renderCard(intent({ out_of_scope: [] }));
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("Nothing listed")).toBeInTheDocument();
  });

  it("Recalculate re-derives, bypassing the fingerprint cache", () => {
    // Without `force` the server serves the cached classification back and the
    // button looks broken.
    renderCard(intent());
    fireEvent.click(screen.getByRole("button", { name: /Recalculate/ }));
    expect(derive.mutate).toHaveBeenCalledWith(true);
  });

  it("warns that an inferred scope is not grounds to dismiss a finding", () => {
    renderCard(intent({ band: "low", sources: [] }));
    expect(screen.getByText(/never as grounds to call a finding out of scope/)).toBeInTheDocument();
  });

  it("a degraded row offers Re-derive instead of a scope it does not have", () => {
    renderCard(intent({ degraded: true, error: "model timed out" }));
    expect(screen.getByText(/Not derived — model timed out/)).toBeInTheDocument();
    expect(screen.queryByText("In scope")).not.toBeInTheDocument();
  });
});
