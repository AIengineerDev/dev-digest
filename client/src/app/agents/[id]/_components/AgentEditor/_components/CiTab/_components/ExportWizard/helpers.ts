/** Pure helpers for the export wizard. No React, no data access. */
import type { CiExportInputBody } from "@devdigest/shared";

/** Toggle one trigger type in/out of the selected set, order-preserving. */
export function toggleTrigger(triggers: readonly string[], type: string): string[] {
  return triggers.includes(type) ? triggers.filter((t) => t !== type) : [...triggers, type];
}

/** Build the request body for both `action: 'files'` (Preview) and
 *  `action: 'open_pr'` (Install) — same shape, only `action` differs. */
export function buildExportInput(input: {
  repo: string;
  triggers: string[];
  postAs: "github_review" | "none";
  action: "files" | "open_pr";
}): CiExportInputBody {
  return {
    repo: input.repo,
    target: "gha",
    action: input.action,
    post_as: input.postAs,
    triggers: input.triggers,
  };
}

/** A repo string is well-formed enough to submit — the server is the real
 *  validator (`parseOwnerRepo`), this only gates the Continue button. */
export function isRepoValid(repo: string): boolean {
  const parts = repo.trim().split("/");
  return parts.length === 2 && parts.every((p) => p.length > 0);
}
