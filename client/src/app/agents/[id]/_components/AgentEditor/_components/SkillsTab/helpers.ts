/* Pure helpers for the Agent Editor → Skills tab.

   The tab holds ONE piece of local state: `order`, the full display order of
   every workspace skill id. Which of them are linked is a separate set. The
   payload sent to the server is `order` filtered by that set, so a skill that
   is toggled off keeps its position and returns where it was when toggled
   back on — instead of jumping to the end. */
import type { AgentSkillLink, Skill } from "@devdigest/shared";

/**
 * Display order for the tab: linked skills first, in `agent_skills.order`,
 * then every unlinked skill in the order the list endpoint returned.
 *
 * Links pointing at a skill that is no longer in the list (deleted, or filtered
 * out server-side) are dropped — an id with no row cannot be rendered or
 * reordered, and keeping it would silently re-link it on the next write.
 */
export function buildOrder(skills: Skill[], links: AgentSkillLink[]): string[] {
  const known = new Set(skills.map((s) => s.id));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => l.skill_id)
    .filter((id) => known.has(id));
  const seen = new Set(linked);
  return [...linked, ...skills.map((s) => s.id).filter((id) => !seen.has(id))];
}

/** The ids currently linked, as an order-independent set. */
export function linkedIds(links: AgentSkillLink[]): Set<string> {
  return new Set(links.map((l) => l.skill_id));
}

/** The write payload: display order narrowed to the linked ids. */
export function toSkillIds(order: string[], linked: ReadonlySet<string>): string[] {
  return order.filter((id) => linked.has(id));
}

/**
 * Move `dragId` to the slot `overId` occupies. Returns the input untouched when
 * either id is unknown or they are the same, so a no-op drop cannot trigger a
 * write.
 */
export function moveBefore(order: string[], dragId: string, overId: string): string[] {
  if (dragId === overId) return order;
  const from = order.indexOf(dragId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, dragId);
  return next;
}

/** Case-insensitive filter over name, description and type. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.type.toLowerCase().includes(q),
  );
}

/** Sort a skill list into `order`; ids missing from `order` keep their tail position. */
export function sortByOrder(skills: Skill[], order: string[]): Skill[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...skills].sort(
    (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Whether this row's on/off can be flipped to `next`.
 *
 * A globally disabled skill enters no agent's prompt, so attaching one here
 * would create a link that does nothing — it is shown, marked `disabled`, and
 * cannot be turned ON. Turning an existing link OFF stays allowed: that is how
 * you clean up after a skill is retired.
 */
export function canToggle(skill: Skill, next: boolean): boolean {
  return skill.enabled || !next;
}
