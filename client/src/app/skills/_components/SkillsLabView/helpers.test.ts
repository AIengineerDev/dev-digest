import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills, resolveSelectedId } from "./helpers";

const base: Skill = {
  id: "sk1",
  name: "test-typology",
  description: "Judge the kind of test, not the coverage number",
  type: "rubric",
  source: "manual",
  body: "",
  enabled: true,
  version: 1,
};

const other: Skill = { ...base, id: "sk2", name: "hermetic-boundaries", description: "Postgres" };

describe("filterSkills", () => {
  it("matches on name and on description, case-insensitively", () => {
    expect(filterSkills([base, other], "HERMETIC").map((s) => s.id)).toEqual(["sk2"]);
    expect(filterSkills([base, other], "coverage").map((s) => s.id)).toEqual(["sk1"]);
  });

  it("returns everything for a blank query", () => {
    expect(filterSkills([base, other], "   ")).toHaveLength(2);
  });
});

describe("resolveSelectedId", () => {
  it("honours the URL when that skill is in the list", () => {
    expect(resolveSelectedId([base, other], "sk2")).toBe("sk2");
  });

  it("falls back to the first row when the URL points at a skill that is gone", () => {
    expect(resolveSelectedId([base, other], "deleted")).toBe("sk1");
  });

  it("is null when there is nothing to select", () => {
    expect(resolveSelectedId([], "sk1")).toBeNull();
  });
});
