import type { Container } from '../../platform/container.js';
import type { UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import * as schema from '../../db/schema.js';
import type { ReviewRepository, PullRow } from './repository.js';

/** Which of the two paths produced the diff, so the run log can say so. */
export type DiffSource = 'git' | 'pr_files';

export interface LoadedDiff {
  diff: UnifiedDiff;
  source: DiffSource;
  /**
   * Why `git` was not used, when it wasn't. The clone is shallow and tracks the
   * default branch, so a PR head that was never fetched makes `git diff` throw —
   * common enough that it must be visible in the run log rather than inferred.
   */
  gitError?: string;
}

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 *
 * Both paths are current — `pr_files` is deleted and re-inserted from GitHub on
 * every PR-detail load — but they are not equivalent: the git path sees the
 * whole diff, while GitHub truncates patches on very large files and omits them
 * on binary ones. The caller reports which path ran, so a review of a partial
 * diff is not mistaken for a review of everything.
 */
export async function loadDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
): Promise<LoadedDiff> {
  let gitError: string | undefined;
  try {
    const diff = await container.git.diff(
      { owner: repoRow.owner, name: repoRow.name },
      pull.base,
      pull.headSha,
    );
    if (diff.files.length > 0) return { diff, source: 'git' };
    gitError = `git diff ${pull.base}...${pull.headSha.slice(0, 7)} returned no files`;
  } catch (err) {
    gitError = (err as Error).message;
  }
  return { diff: await diffFromPrFiles(repo, pull.id), source: 'pr_files', ...(gitError ? { gitError } : {}) };
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(repo: ReviewRepository, prId: string): Promise<UnifiedDiff> {
  const files = await repo.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
