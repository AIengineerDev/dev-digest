import { describe, it, expect } from "vitest";
import { isNotIndexed, shortSha } from "./helpers";

describe("isNotIndexed", () => {
  it("is true when there is no state yet", () => {
    expect(isNotIndexed(undefined)).toBe(true);
    expect(isNotIndexed(null)).toBe(true);
  });

  it("is true for a real failed index (C1)", () => {
    expect(
      isNotIndexed({ status: "failed", filesIndexed: 0, filesSkipped: 0, lastIndexedSha: "abc1234", updatedAt: "" }),
    ).toBe(true);
  });

  it("is true for the synthesized no-row state — degraded with an empty sha", () => {
    // server/src/modules/repo-intel/service.ts:192-204 — no repo_index_state
    // row synthesizes { status: 'degraded', lastIndexedSha: '' } rather than
    // throwing, so 'degraded' alone cannot mean not-indexed (R18).
    expect(
      isNotIndexed({ status: "degraded", filesIndexed: 0, filesSkipped: 0, lastIndexedSha: "", updatedAt: "" }),
    ).toBe(true);
  });

  it("is false for a real degraded index that has indexed something (R18: generation proceeds with a banner)", () => {
    expect(
      isNotIndexed({
        status: "degraded",
        filesIndexed: 40,
        filesSkipped: 3,
        lastIndexedSha: "deadbeef",
        updatedAt: "",
      }),
    ).toBe(false);
  });

  it("is false for full and partial indexes", () => {
    expect(
      isNotIndexed({ status: "full", filesIndexed: 100, filesSkipped: 0, lastIndexedSha: "abc1234", updatedAt: "" }),
    ).toBe(false);
    expect(
      isNotIndexed({
        status: "partial",
        filesIndexed: 90,
        filesSkipped: 10,
        lastIndexedSha: "abc1234",
        updatedAt: "",
      }),
    ).toBe(false);
  });
});

describe("shortSha", () => {
  it("truncates to 7 characters", () => {
    expect(shortSha("deadbeefcafe1234")).toBe("deadbee");
  });

  it("is empty for null/undefined", () => {
    expect(shortSha(null)).toBe("");
    expect(shortSha(undefined)).toBe("");
  });
});
