import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { isAttached, toggleTarget, usedByAgentIds } from "./helpers";

function skill(id: string, name: string, enabled = true): Skill {
  return { id, name, description: "", type: "custom", source: "manual", body: "", enabled, version: 1 };
}

describe("toggleTarget / isAttached", () => {
  it("adds a target when turning on, removes it when turning off", () => {
    const on = toggleTarget([], "agent", "a1", true);
    expect(isAttached(on, "agent", "a1")).toBe(true);
    const off = toggleTarget(on, "agent", "a1", false);
    expect(isAttached(off, "agent", "a1")).toBe(false);
  });

  it("leaves other targets untouched", () => {
    const existing = [{ target_kind: "skill" as const, target_id: "s1" }];
    const next = toggleTarget(existing, "agent", "a1", true);
    expect(next).toEqual([{ target_kind: "skill", target_id: "s1" }, { target_kind: "agent", target_id: "a1" }]);
  });
});

describe("usedByAgentIds (R6, D2, C14)", () => {
  it("counts a directly attached agent once", () => {
    const used = usedByAgentIds(
      [{ id: "a1" }],
      [{ target_kind: "agent", target_id: "a1" }],
      [undefined],
      new Map(),
    );
    expect(used).toEqual(new Set(["a1"]));
  });

  it("counts an agent that only reads the document through an enabled linked skill", () => {
    const links: AgentSkillLink[] = [{ agent_id: "a1", skill_id: "s1", order: 0 }];
    const used = usedByAgentIds(
      [{ id: "a1" }],
      [{ target_kind: "skill", target_id: "s1" }],
      [links],
      new Map([["s1", skill("s1", "Security baseline")]]),
    );
    expect(used).toEqual(new Set(["a1"]));
  });

  it("deduplicates an agent attached both directly and via a skill (R6, C11)", () => {
    const links: AgentSkillLink[] = [{ agent_id: "a1", skill_id: "s1", order: 0 }];
    const used = usedByAgentIds(
      [{ id: "a1" }],
      [
        { target_kind: "agent", target_id: "a1" },
        { target_kind: "skill", target_id: "s1" },
      ],
      [links],
      new Map([["s1", skill("s1", "Security baseline")]]),
    );
    expect(used.size).toBe(1);
  });

  it("a globally disabled skill contributes no agent (C14)", () => {
    const links: AgentSkillLink[] = [{ agent_id: "a1", skill_id: "s1", order: 0 }];
    const used = usedByAgentIds(
      [{ id: "a1" }],
      [{ target_kind: "skill", target_id: "s1" }],
      [links],
      new Map([["s1", skill("s1", "Security baseline", false)]]),
    );
    expect(used.size).toBe(0);
  });
});
