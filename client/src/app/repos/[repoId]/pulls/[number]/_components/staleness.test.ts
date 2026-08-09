/**
 * The asymmetry that matters: a MISSING sha is not evidence of staleness.
 * Runs written before `agent_runs.head_sha` existed carry null, and treating
 * null as stale would flag a repo's entire review history — including the run
 * that produced the findings you are reading right now.
 */
import { describe, it, expect } from "vitest";
import { isStaleRun, shortSha } from "./staleness";

describe("isStaleRun", () => {
  it("is stale only when both shas are known and differ", () => {
    expect(isStaleRun("aaa111", "bbb222")).toBe(true);
    expect(isStaleRun("aaa111", "aaa111")).toBe(false);
  });

  it("treats an unknown sha on either side as current, never stale", () => {
    expect(isStaleRun(null, "bbb222")).toBe(false);
    expect(isStaleRun("aaa111", null)).toBe(false);
    expect(isStaleRun(undefined, undefined)).toBe(false);
    expect(isStaleRun("", "bbb222")).toBe(false);
  });
});

describe("shortSha", () => {
  it("abbreviates to 7 and tolerates a missing sha", () => {
    expect(shortSha("773828c0deadbeef")).toBe("773828c");
    expect(shortSha(null)).toBe("");
  });
});
