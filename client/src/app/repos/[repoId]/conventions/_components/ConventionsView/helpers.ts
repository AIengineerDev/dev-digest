import type { Convention, ConventionStatus } from "@devdigest/shared";

/** Pure helpers for the Conventions screen. No React. */

/**
 * Permalink to the evidence on GitHub.
 *
 * `head_sha` is what the scan recorded, and using it rather than the branch name
 * is the whole point: the line the rule was derived from keeps pointing at that
 * code even after the file moves on. A row with no sha (a scan that ran against
 * a clone with no resolvable HEAD) falls back to the default branch, which is
 * approximate but still lands in the right file.
 */
export function evidenceUrl(
  repoFullName: string | undefined,
  c: Pick<Convention, "evidence_path" | "evidence_line" | "head_sha">,
  defaultBranch = "main",
): string | undefined {
  if (!repoFullName) return undefined;
  const ref = c.head_sha ?? defaultBranch;
  return `https://github.com/${repoFullName}/blob/${ref}/${c.evidence_path}#L${c.evidence_line}`;
}

/** `src/api/handler.ts:42` — the label under the snippet. */
export function evidenceLabel(c: Pick<Convention, "evidence_path" | "evidence_line">): string {
  return `${c.evidence_path}:${c.evidence_line}`;
}

export function countByStatus(
  conventions: Convention[],
): Record<ConventionStatus, number> {
  const out: Record<ConventionStatus, number> = { pending: 0, accepted: 0, rejected: 0 };
  for (const c of conventions) out[c.status] += 1;
  return out;
}

/**
 * Sort for display: undecided first (they are the work), then accepted, then
 * rejected, and by confidence within each. The server orders alphabetically by
 * status, which puts `accepted` before `pending` — correct for a query, wrong
 * for a queue.
 */
const STATUS_ORDER: Record<ConventionStatus, number> = { pending: 0, accepted: 1, rejected: 2 };

export function sortForReview(conventions: Convention[]): Convention[] {
  return [...conventions].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.confidence - a.confidence,
  );
}

/** Default name for the skill built from a repo's accepted rules. */
export function defaultSkillName(repoFullName: string | undefined): string {
  const repo = repoFullName?.split("/").pop() ?? "repo";
  return `${repo}-conventions`;
}
