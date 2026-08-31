import { Octokit } from '@octokit/rest';
import type { GitHubReviewPayload } from '@devdigest/shared';

/**
 * This package's own, minimal GitHub surface. It does **not** import
 * `server/src/adapters/github/**` — the target repo the runner posts to is
 * not this repository, and `injected-adapters-only-from-container`
 * (`server/.dependency-cruiser.cjs:56`) is a server-module rule that would
 * not even apply here, but the underlying reason — the runner owns its own
 * `@octokit/rest` client — does (`reviewer-core/src/output/to-review.ts:5-8`:
 * "shared by the CI runner (posts via octokit)").
 */
export interface RepoRef {
  owner: string;
  name: string;
}

/** Parse `"owner/name"` (the `GITHUB_REPOSITORY` shape) into a `RepoRef`. */
export function parseRepo(full: string): RepoRef {
  const [owner, name] = full.split('/');
  if (!owner || !name) {
    throw new Error(`GITHUB_REPOSITORY must be "owner/name", got "${full}"`);
  }
  return { owner, name };
}

/**
 * Post a review to a PR. Mirrors the shape of the studio's
 * `OctokitGitHubClient.postReview` (`server/src/adapters/github/octokit.ts:137`)
 * exactly, without importing it — a defect in one is not a defect in the
 * other, and this file is what a security reviewer reads for the runner's
 * only outbound write.
 */
export async function postReview(
  octokit: Octokit,
  repo: RepoRef,
  prNumber: number,
  review: GitHubReviewPayload,
): Promise<{ id: string }> {
  const res = await octokit.rest.pulls.createReview({
    owner: repo.owner,
    repo: repo.name,
    pull_number: prNumber,
    body: review.body,
    event: review.event,
    comments: review.comments?.map((c) => ({ path: c.path, line: c.line, body: c.body })),
  });
  return { id: String(res.data.id) };
}
