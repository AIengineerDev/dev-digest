/** Pure helpers for SkillsLabView. */

import type { Skill } from "@devdigest/shared";

/** Client-side name/description match for the list search box. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}

/**
 * Which skill the centre pane shows.
 *
 * The URL wins, but only if that skill is actually in the (possibly filtered)
 * list — otherwise a stale `?skill=` from a deleted row would leave the editor
 * pointing at nothing. Falls back to the first row, then to null.
 */
export function resolveSelectedId(skills: Skill[], param: string | null): string | null {
  if (param && skills.some((s) => s.id === param)) return param;
  return skills[0]?.id ?? null;
}
