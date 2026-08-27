import { describe, it, expect } from "vitest";
import { categoryForPath, directoryOf, filenameOf, filterDocs, isAttached, nextTargets } from "./helpers";

describe("categoryForPath", () => {
  it("classifies a README by basename, any casing or extension", () => {
    expect(categoryForPath("README.md")).toBe("readme");
    expect(categoryForPath("readme.md")).toBe("readme");
    expect(categoryForPath("docs/Readme.markdown")).toBe("readme");
  });

  it("classifies an INSIGHTS file by basename, nested or not", () => {
    expect(categoryForPath("INSIGHTS.md")).toBe("insights");
    expect(categoryForPath("server/INSIGHTS.md")).toBe("insights");
  });

  it("classifies anything under a specs/ directory as specs", () => {
    expect(categoryForPath("specs/09-project-context.md")).toBe("specs");
    expect(categoryForPath("server/specs/01-foo.md")).toBe("specs");
  });

  it("falls back to docs for everything else", () => {
    expect(categoryForPath("docs/architecture.md")).toBe("docs");
    expect(categoryForPath("CONTRIBUTING.md")).toBe("docs");
  });

  it("does not match a filename that merely contains 'specs'", () => {
    expect(categoryForPath("specs-overview.md")).toBe("docs");
  });
});

describe("directoryOf / filenameOf", () => {
  it("splits a nested path", () => {
    expect(directoryOf("docs/architecture/overview.md")).toBe("docs/architecture");
    expect(filenameOf("docs/architecture/overview.md")).toBe("overview.md");
  });

  it("a root-level file has no directory", () => {
    expect(directoryOf("README.md")).toBe("");
    expect(filenameOf("README.md")).toBe("README.md");
  });
});

describe("isAttached / nextTargets", () => {
  const targets = [
    { target_kind: "skill" as const, target_id: "sk-1" },
    { target_kind: "agent" as const, target_id: "agent-2" },
  ];

  it("isAttached reads only this agent's own target row", () => {
    expect(isAttached(targets, "agent-2")).toBe(true);
    expect(isAttached(targets, "agent-1")).toBe(false);
  });

  it("nextTargets appends this agent without touching siblings", () => {
    expect(nextTargets(targets, "agent-1", true)).toEqual([...targets, { target_kind: "agent", target_id: "agent-1" }]);
  });

  it("nextTargets removes only this agent, preserving every sibling", () => {
    expect(nextTargets(targets, "agent-2", false)).toEqual([{ target_kind: "skill", target_id: "sk-1" }]);
  });
});

describe("filterDocs", () => {
  const docs = [{ path: "docs/a.md" }, { path: "specs/b.md" }, { path: "README.md" }];

  it("is a case-insensitive substring match over the path", () => {
    expect(filterDocs(docs, "SPECS").map((d) => d.path)).toEqual(["specs/b.md"]);
  });

  it("returns everything for an empty query", () => {
    expect(filterDocs(docs, "  ")).toBe(docs);
  });
});
