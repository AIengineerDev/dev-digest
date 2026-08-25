/** Pure helpers for the Agent Editor → Context tab. No React. */

export interface AttachmentTarget {
  target_kind: "agent" | "skill";
  target_id: string;
}

export type ContextCategory = "readme" | "specs" | "insights" | "docs";

/**
 * Category for a document, derived from its own path — never asked of the
 * model or the server, since `ProjectContextDoc`/`ProjectContextDocDetail`
 * carry no such field (`@devdigest/shared` `contracts/platform.ts:267-307`).
 * `readme` and `insights` match the basename (case-insensitive, any
 * extension); `specs` matches a `specs/` path segment anywhere in the path;
 * everything else is `docs`.
 */
export function categoryForPath(path: string): ContextCategory {
  const base = filenameOf(path);
  if (/^readme(\.\w+)?$/i.test(base)) return "readme";
  if (/^insights(\.\w+)?$/i.test(base)) return "insights";
  if (/(^|\/)specs\//i.test(path)) return "specs";
  return "docs";
}

/** The directory portion of a path, `""` for a root-level file. */
export function directoryOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** The filename portion of a path. */
export function filenameOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

/** Whether THIS agent is already attached to a document, given its detail's
 *  full attachment list. */
export function isAttached(attachments: AttachmentTarget[], agentId: string): boolean {
  return attachments.some((a) => a.target_kind === "agent" && a.target_id === agentId);
}

/**
 * The document's next full attachment-target set with THIS agent flipped on
 * or off.
 *
 * `PUT /repos/:id/context/attachments` replaces the WHOLE set for one
 * document — same contract the skill-side
 * `SkillEditor/_components/ContextTab/helpers.ts:nextTargets` already solves
 * — so every other attachment already on the document (sibling agents, and
 * every skill attached directly) must be carried through unchanged. Skip this
 * and an agent-centric toggle here would silently detach the document from
 * every skill and every other agent that uses it.
 */
export function nextTargets(attachments: AttachmentTarget[], agentId: string, on: boolean): AttachmentTarget[] {
  const without = attachments.filter((a) => !(a.target_kind === "agent" && a.target_id === agentId));
  return on ? [...without, { target_kind: "agent", target_id: agentId }] : without;
}

/** Case-insensitive filter over the document path. */
export function filterDocs<T extends { path: string }>(docs: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) => d.path.toLowerCase().includes(q));
}
