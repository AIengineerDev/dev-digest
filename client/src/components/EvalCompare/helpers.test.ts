import { describe, it, expect } from "vitest";
import { diffLines } from "./helpers";

describe("diffLines", () => {
  it("returns null when a snapshot is missing — unknown is not unchanged", () => {
    expect(diffLines(null, "a")).toBeNull();
  });

  it("returns an empty array for identical prompts", () => {
    expect(diffLines("a\nb", "a\nb")).toEqual([]);
  });

  it("marks added and removed lines", () => {
    const out = diffLines("keep\nold", "keep\nnew")!;
    expect(out).toContainEqual({ kind: "del", text: "old" });
    expect(out).toContainEqual({ kind: "add", text: "new" });
    expect(out).toContainEqual({ kind: "same", text: "keep" });
  });
});
