import { describe, it, expect } from 'vitest';
import { loadDiff } from '../src/modules/reviews/diff-loader.js';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';

/**
 * The diff has two sources and they are NOT equivalent: `git diff base...head`
 * in the clone, and a reconstruction from the `pr_files` patches GitHub gave us.
 * The clone is shallow and tracks the default branch, so a PR head that was
 * never fetched makes the git path throw — silently, before this. What is
 * asserted here is that the fallback is always *reported*, with the reason, so a
 * run log says which code the review actually saw.
 */

const pull = { id: 'pr-1', base: 'main', headSha: 'deadbeefcafe' } as never;
const repoRow = { owner: 'acme', name: 'app' } as never;

function repoWithFiles(files: { path: string; patch: string | null }[]): ReviewRepository {
  return { getPrFiles: async () => files } as unknown as ReviewRepository;
}

function containerWithGit(diff: () => Promise<unknown>): Container {
  return { git: { diff } } as unknown as Container;
}

const PATCH = '@@ -1 +1 @@\n-old\n+new';

describe('loadDiff', () => {
  it('uses the clone when git can serve the diff', async () => {
    const container = containerWithGit(async () => ({ files: [{ path: 'a.ts' }] }));
    const loaded = await loadDiff(container, repoWithFiles([]), 'ws', pull, repoRow);
    expect(loaded.source).toBe('git');
    expect(loaded.gitError).toBeUndefined();
  });

  it('falls back to pr_files and reports WHY when git throws', async () => {
    const container = containerWithGit(async () => {
      throw new Error("fatal: bad object deadbeefcafe");
    });
    const loaded = await loadDiff(
      container,
      repoWithFiles([{ path: 'a.ts', patch: PATCH }]),
      'ws',
      pull,
      repoRow,
    );
    expect(loaded.source).toBe('pr_files');
    expect(loaded.gitError).toContain('bad object');
    expect(loaded.diff.files).toHaveLength(1);
  });

  it('treats an empty git diff as a miss, not as "nothing changed"', async () => {
    // A clone missing the head resolves `base...head` to nothing rather than
    // failing, which would otherwise hand the reviewer a zero-file diff.
    const container = containerWithGit(async () => ({ files: [] }));
    const loaded = await loadDiff(
      container,
      repoWithFiles([{ path: 'a.ts', patch: PATCH }]),
      'ws',
      pull,
      repoRow,
    );
    expect(loaded.source).toBe('pr_files');
    expect(loaded.gitError).toContain('no files');
    expect(loaded.diff.files).toHaveLength(1);
  });
});
