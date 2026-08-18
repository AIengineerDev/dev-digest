import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { blockersAtHead, findingsAtHead, reviewsAtHead, scoreAtHead } from "./reviewsAtHead";

const HEAD = "abc";

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "x",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

function review(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: "Agent",
    head_sha: HEAD,
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

describe("reviewsAtHead", () => {
  it("keeps every review of the current head and drops older ones, order-independent", () => {
    const reviews = [
      review({ id: "old", head_sha: "old-head" }),
      review({ id: "current" }),
    ];
    expect(reviewsAtHead(reviews, HEAD).map((r) => r.id)).toEqual(["current"]);
  });

  it("treats an unrecorded head as current, never as stale", () => {
    const reviews = [review({ id: "legacy", head_sha: null })];
    expect(reviewsAtHead(reviews, HEAD).map((r) => r.id)).toEqual(["legacy"]);
  });
});

describe("findingsAtHead", () => {
  it("flattens findings from reviews at head only", () => {
    const reviews = [
      review({ id: "old", head_sha: "old-head", findings: [finding({ id: "stale" })] }),
      review({ id: "current", findings: [finding({ id: "f1" }), finding({ id: "f2" })] }),
    ];
    expect(findingsAtHead(reviews, HEAD).map((f) => f.id)).toEqual(["f1", "f2"]);
  });
});

describe("blockersAtHead", () => {
  it("counts undismissed CRITICAL findings across every review at head", () => {
    const reviews = [
      review({ id: "a", agent_name: "A", findings: [finding({ id: "c1", severity: "CRITICAL" })] }),
      review({
        id: "b",
        agent_name: "B",
        findings: [
          finding({ id: "c2", severity: "CRITICAL", dismissed_at: "2026-08-17T00:00:00Z" }),
          finding({ id: "w1", severity: "WARNING" }),
        ],
      }),
    ];
    // c1 counts, c2 is dismissed, w1 is not CRITICAL.
    expect(blockersAtHead(reviews, HEAD)).toBe(1);
  });
});

describe("scoreAtHead", () => {
  it("is the minimum across reviews at head — the harshest agent's read", () => {
    const reviews = [review({ id: "a", score: 90 }), review({ id: "b", score: 40 })];
    expect(scoreAtHead(reviews, HEAD)).toBe(40);
  });

  it("is null, never 0, when no review at head reports a score", () => {
    expect(scoreAtHead([], HEAD)).toBeNull();
    expect(scoreAtHead(undefined, HEAD)).toBeNull();
  });

  it("ignores a review's null score rather than treating it as 0", () => {
    const reviews = [review({ id: "a", score: null }), review({ id: "b", score: 55 })];
    expect(scoreAtHead(reviews, HEAD)).toBe(55);
  });
});
