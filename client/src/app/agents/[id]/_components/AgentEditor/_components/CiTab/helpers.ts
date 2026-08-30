/** Pure formatting for the CI tab. No React, no data access. */

/** `installed_at` (an ISO timestamp) as a short, locale date — what the
 *  `ciTab.installed` string interpolates. */
export function formatInstalledAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
