import { describe, it, expect } from "vitest";
import type { ProjectContextDoc } from "@devdigest/shared";
import { filterDocs, groupByDirectory, isGenuinelyEmpty, isRepoIndexing, isUnattachable } from "./helpers";

function doc(path: string, overrides: Partial<ProjectContextDoc> = {}): ProjectContextDoc {
  return {
    path,
    size: 100,
    tokens: 10,
    agent_count: 0,
    skill_count: 0,
    missing: false,
    too_large: false,
    ...overrides,
  };
}

describe("groupByDirectory", () => {
  it("groups by directory and sorts groups and rows, keeping full paths", () => {
    const groups = groupByDirectory([doc("README.md"), doc("docs/a.md"), doc("docs/README.md")]);
    expect(groups.map((g) => g.dir)).toEqual(["", "docs"]);
    expect(groups[0]!.docs.map((d) => d.path)).toEqual(["README.md"]);
    expect(groups[1]!.docs.map((d) => d.path)).toEqual(["docs/a.md", "docs/README.md"]);
  });

  it("two documents sharing a basename in different directories stay distinguishable by full path (C3)", () => {
    const groups = groupByDirectory([doc("README.md"), doc("docs/README.md")]);
    const paths = groups.flatMap((g) => g.docs.map((d) => d.path));
    expect(paths).toEqual(["README.md", "docs/README.md"]);
  });
});

describe("filterDocs", () => {
  it("filters case-insensitively on the full path", () => {
    const docs = [doc("README.md"), doc("docs/prd.MD")];
    expect(filterDocs(docs, "prd").map((d) => d.path)).toEqual(["docs/prd.MD"]);
  });

  it("returns everything for a blank query", () => {
    const docs = [doc("README.md")];
    expect(filterDocs(docs, "  ")).toEqual(docs);
  });
});

describe("isRepoIndexing / isGenuinelyEmpty", () => {
  it("a repo with no clone_path yet is indexing, not empty (C1 vs C2)", () => {
    expect(isRepoIndexing({ clone_path: null })).toBe(true);
    expect(isGenuinelyEmpty({ clone_path: null }, [])).toBe(false);
  });

  it("a cloned repo with zero discovered documents is genuinely empty (C2)", () => {
    expect(isRepoIndexing({ clone_path: "/clones/x" })).toBe(false);
    expect(isGenuinelyEmpty({ clone_path: "/clones/x" }, [])).toBe(true);
  });

  it("a cloned repo with documents is neither indexing nor empty", () => {
    expect(isGenuinelyEmpty({ clone_path: "/clones/x" }, [doc("a.md")])).toBe(false);
  });
});

describe("isUnattachable", () => {
  it("flags too-large and missing documents", () => {
    expect(isUnattachable({ too_large: true, missing: false })).toBe(true);
    expect(isUnattachable({ too_large: false, missing: true })).toBe(true);
    expect(isUnattachable({ too_large: false, missing: false })).toBe(false);
  });
});
