import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** Pure helpers shared by SkillsTab and AgentsTab. No React. */

export interface AttachmentTarget {
  target_kind: "agent" | "skill";
  target_id: string;
}

/** The new full attachment set after flipping one row's toggle — `PUT
 *  /repos/:id/context/attachments` always replaces the whole set for the
 *  document (C9: last write wins, no merge dialog), so every toggle computes
 *  the next full list rather than sending a delta. */
export function toggleTarget(
  existing: AttachmentTarget[],
  kind: "agent" | "skill",
  id: string,
  on: boolean,
): AttachmentTarget[] {
  const without = existing.filter((t) => !(t.target_kind === kind && t.target_id === id));
  return on ? [...without, { target_kind: kind, target_id: id }] : without;
}

export function isAttached(existing: AttachmentTarget[], kind: "agent" | "skill", id: string): boolean {
  return existing.some((t) => t.target_kind === kind && t.target_id === id);
}

/**
 * Deduplicated union of agents that read this document — direct attachment or
 * through an *enabled* linked skill (R6, D2, C14: a globally disabled skill
 * contributes nothing). Backs the doc header's "Used by N agents" (D2).
 */
export function usedByAgentIds(
  agents: Array<{ id: string }>,
  attachments: AttachmentTarget[],
  skillLinksByAgent: Array<AgentSkillLink[] | undefined>,
  skillById: Map<string, Skill>,
): Set<string> {
  const attachedSkillIds = new Set(attachments.filter((a) => a.target_kind === "skill").map((a) => a.target_id));
  const used = new Set<string>();
  for (const t of attachments) {
    if (t.target_kind === "agent") used.add(t.target_id);
  }
  agents.forEach((agent, i) => {
    const links = skillLinksByAgent[i];
    if (!links) return;
    for (const link of links) {
      if (!attachedSkillIds.has(link.skill_id)) continue;
      const skill = skillById.get(link.skill_id);
      if (skill?.enabled) used.add(agent.id);
    }
  });
  return used;
}
