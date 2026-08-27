/** Pure helpers for the Agent Editor → Context tab. No React. */

export interface AttachmentTarget {
  target_kind: "agent" | "skill";
  target_id: string;
  order?: number;
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

/**
 * Display order for the tab, mirroring SkillsTab's `buildOrder`: every
 * document THIS agent is attached to, first, in its persisted
 * `attachments[].order` for `agent:agentId` (ascending); then every other
 * discovered document, in the order the list endpoint returned it.
 *
 * `detailByPath` may not have every document's detail loaded yet (they load
 * one query per row) — a document whose detail is still pending is treated
 * as unattached until it resolves, which is why the caller re-derives this
 * on every detail load, not just once.
 */
export function buildDocOrder<D extends { path: string }>(
  docs: D[],
  detailByPath: Map<string, { attachments: AttachmentTarget[] } | undefined>,
  agentId: string,
): string[] {
  const attached = docs
    .map((d) => {
      const row = detailByPath
        .get(d.path)
        ?.attachments.find((a) => a.target_kind === "agent" && a.target_id === agentId);
      return row ? { path: d.path, order: row.order ?? 0 } : null;
    })
    .filter((x): x is { path: string; order: number } => x !== null)
    .sort((a, b) => a.order - b.order)
    .map((x) => x.path);
  const seen = new Set(attached);
  const rest = docs.map((d) => d.path).filter((p) => !seen.has(p));
  return [...attached, ...rest];
}

/**
 * Move `dragPath` to the slot `overPath` occupies. Returns the input
 * untouched when either path is unknown or they are the same, so a no-op
 * drop cannot trigger a write. Identical shape to SkillsTab's `moveBefore`.
 */
export function moveBefore(order: string[], dragPath: string, overPath: string): string[] {
  if (dragPath === overPath) return order;
  const from = order.indexOf(dragPath);
  const to = order.indexOf(overPath);
  if (from < 0 || to < 0) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, dragPath);
  return next;
}

/** Sort a document list into `order`; paths missing from `order` keep their tail position. */
export function sortByOrder<D extends { path: string }>(docs: D[], order: string[]): D[] {
  const rank = new Map(order.map((p, i) => [p, i]));
  return [...docs].sort(
    (a, b) => (rank.get(a.path) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.path) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** The write payload for `PUT /repos/:id/context/order`: display order narrowed to attached paths. */
export function toOrderedPaths(order: string[], attached: ReadonlySet<string>): string[] {
  return order.filter((p) => attached.has(p));
}
