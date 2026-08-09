/** Pure helpers for SkillEditor. */

/**
 * The body currently in the editor.
 *
 * `draft === null` means "untouched": the saved body is shown as-is, so a
 * refetch after a save is picked up without an effect mirroring server state.
 */
export function currentBody(draft: string | null, saved: string): string {
  return draft ?? saved;
}

/** Whether the editor holds unsaved changes. */
export function isDirty(draft: string | null, saved: string): boolean {
  return draft !== null && draft !== saved;
}

/** Whether a body exceeds the per-skill limit and must be blocked on save. */
export function isOverLimit(body: string, limit: number): boolean {
  return body.length > limit;
}
