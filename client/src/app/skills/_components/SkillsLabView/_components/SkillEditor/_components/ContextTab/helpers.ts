/** Pure helpers for ContextTab. No React. */

export interface AttachmentTarget {
  target_kind: "agent" | "skill";
  target_id: string;
}

/** Whether THIS skill is already attached to a document, given its detail's
 *  full attachment list. */
export function isAttached(attachments: AttachmentTarget[], skillId: string): boolean {
  return attachments.some((a) => a.target_kind === "skill" && a.target_id === skillId);
}

/**
 * The document's next full attachment-target set with THIS skill flipped on
 * or off.
 *
 * `PUT /repos/:id/context/attachments` replaces the WHOLE set for one
 * document (same contract the document-side AttachTabs/helpers.ts:toggleTarget
 * relies on) — so every other attachment already on the document (sibling
 * skills, and every agent attached directly) must be carried through
 * unchanged. Skip this and a skill-centric toggle here would silently detach
 * the document from every agent that uses it, which is exactly the failure
 * the PR brief calls out. It is why a row's toggle stays disabled until that
 * document's own detail (not just its list row) has loaded — the full set
 * isn't known before then.
 */
export function nextTargets(
  attachments: AttachmentTarget[],
  skillId: string,
  on: boolean,
): AttachmentTarget[] {
  const without = attachments.filter((a) => !(a.target_kind === "skill" && a.target_id === skillId));
  return on ? [...without, { target_kind: "skill", target_id: skillId }] : without;
}
