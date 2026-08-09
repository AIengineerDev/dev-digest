import type { Convention } from "@devdigest/shared";

/**
 * Compose the skill body the modal opens with.
 *
 * This mirrors `buildConventionsSkillBody` on the server
 * (server/src/modules/conventions/helpers.ts). The duplication is deliberate and
 * bounded: the modal has to show the exact text that will be saved *before* it
 * is saved, and the user may edit it — so whatever this produces is what the
 * client sends. The server's copy is the fallback for an API caller that omits
 * `body`, not a second author of the same document.
 */
export function composeSkillBody(repoFullName: string, conventions: Convention[]): string {
  const header = [
    `# ${repoFullName} — house conventions`,
    "",
    `Conventions extracted from \`${repoFullName}\` and confirmed by a maintainer.`,
    "Flag any change that violates a rule below, and cite the offending `file:line`.",
    "A rule not covered here is not a finding — say nothing rather than inventing one.",
  ].join("\n");

  const blocks = conventions.map((c) => {
    const lines = [`## ${slugifyRule(c.rule)}`, `**${c.category}** — ${c.rule}`];
    if (c.rationale) lines.push("", c.rationale);
    lines.push(
      "",
      `Precedent — \`${c.evidence_path}:${c.evidence_line}\`:`,
      "",
      "```",
      c.evidence_snippet.trim(),
      "```",
    );
    return lines.join("\n");
  });

  return [header, ...blocks].join("\n\n");
}

/** Stable heading slug for a rule — same shape as the server's. */
export function slugifyRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 6)
    .join("-");
}
