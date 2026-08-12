import { describe, it, expect } from "vitest";
import type { Convention } from "@devdigest/shared";
import { countByStatus, defaultSkillName, evidenceLabel, evidenceUrl, sortForReview } from "./helpers";
import { composeSkillBody } from "./_components/SkillFromConventionsModal/helpers";

const base: Convention = {
  id: "c1",
  repo_id: "r1",
  category: "error-handling",
  rule: "Route handlers throw ValidationError instead of returning a bare 400.",
  rationale: null,
  evidence_path: "src/api/handler.ts",
  evidence_line: 5,
  evidence_snippet: 'throw new ValidationError("bad input");',
  confidence: 0.9,
  status: "pending",
  head_sha: "deadbeef",
  created_at: "2026-08-09T10:00:00.000Z",
};

describe("evidenceUrl", () => {
  it("permalinks at the scanned commit", () => {
    expect(evidenceUrl("acme/api", base)).toBe(
      "https://github.com/acme/api/blob/deadbeef/src/api/handler.ts#L5",
    );
  });

  it("returns nothing without a repo — a half-built GitHub URL is worse than none", () => {
    expect(evidenceUrl(undefined, base)).toBeUndefined();
  });

  it("labels the evidence as file:line", () => {
    expect(evidenceLabel(base)).toBe("src/api/handler.ts:5");
  });
});

describe("sortForReview", () => {
  it("puts undecided candidates first, then by confidence", () => {
    const list: Convention[] = [
      { ...base, id: "accepted", status: "accepted", confidence: 0.99 },
      { ...base, id: "low", confidence: 0.6 },
      { ...base, id: "rejected", status: "rejected", confidence: 0.95 },
      { ...base, id: "high", confidence: 0.92 },
    ];
    expect(sortForReview(list).map((c) => c.id)).toEqual([
      "high",
      "low",
      "accepted",
      "rejected",
    ]);
  });

  it("counts each status", () => {
    const counts = countByStatus([base, { ...base, status: "accepted" }]);
    expect(counts).toEqual({ pending: 1, accepted: 1, rejected: 0 });
  });
});

describe("defaultSkillName", () => {
  it("names the skill after the repo, not the owner", () => {
    expect(defaultSkillName("acme/payments-api")).toBe("payments-api-conventions");
    expect(defaultSkillName(undefined)).toBe("repo-conventions");
  });
});

describe("composeSkillBody", () => {
  it("keeps every accepted rule attached to the code it came from", () => {
    const body = composeSkillBody("acme/payments-api", [base]);
    expect(body).toContain(base.rule);
    expect(body).toContain("src/api/handler.ts:5");
    expect(body).toContain(base.evidence_snippet);
  });

  it("states the closed-world rule, so the agent does not invent findings", () => {
    expect(composeSkillBody("acme/api", [base])).toContain("not covered here is not a finding");
  });
});
