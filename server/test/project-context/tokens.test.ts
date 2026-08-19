import { describe, it, expect } from 'vitest';
import { MockGitClient } from '../../src/adapters/mocks.js';
import { TiktokenTokenizer, type Tokenizer } from '../../src/adapters/tokenizer/index.js';
import { DocumentTokenCounter } from '../../src/modules/project-context/token-counter.js';
import { mapWithConcurrency } from '../../src/modules/project-context/helpers.js';
import { DOC_READ_CONCURRENCY } from '../../src/modules/project-context/constants.js';

const ref = { owner: 'acme', name: 'widgets' };

describe('DocumentTokenCounter', () => {
  it('returns exactly container.tokenizer.count of the exact file content (spec A3)', async () => {
    const tokenizer = new TiktokenTokenizer();
    const content = '# Project PRD\n\nAll public endpoints MUST be rate-limited.\n'.repeat(20);
    const git = new MockGitClient({ files: { 'docs/prd.md': content } });
    const counter = new DocumentTokenCounter(git, tokenizer);

    const counted = await counter.countPath(ref, 'docs/prd.md');
    expect(counted).toBe(tokenizer.count(content));
  });

  it('caches by content hash — a repeat read re-tokenises nothing (spec C5)', async () => {
    let calls = 0;
    const spy: Tokenizer = {
      count: (text: string) => {
        calls += 1;
        return text.length;
      },
    };
    const content = 'same content twice';
    const git = new MockGitClient({ files: { 'a.md': content, 'b.md': content } });
    const counter = new DocumentTokenCounter(git, spy);

    await counter.countPath(ref, 'a.md');
    await counter.countPath(ref, 'b.md'); // different path, identical content
    expect(calls).toBe(1);
  });

  it('degrades to null, never throws, when the document is unreadable (spec C7)', async () => {
    const git = new MockGitClient({ files: {} }); // readFile returns '' for unknown paths, not a throw
    const counter = new DocumentTokenCounter(git, new TiktokenTokenizer());
    // MockGitClient.readFile never throws — force a throwing git to exercise the catch path.
    const throwingGit = {
      ...git,
      readFile: async () => {
        throw new Error('ENOENT');
      },
    } as unknown as typeof git;
    const throwingCounter = new DocumentTokenCounter(throwingGit, new TiktokenTokenizer());
    await expect(throwingCounter.countPath(ref, 'missing.md')).resolves.toBeNull();
    // Sanity: the non-throwing mock still counts empty content as 0/near-0, not null.
    expect(await counter.countPath(ref, 'anything.md')).not.toBeNull();
  });

  /**
   * Plan A2: "the cold-start wall time for a 500-document fixture is recorded
   * in the phase output. If it exceeds 1s, stop and escalate rather than
   * silently shipping over the NF bound." Measures, does not assert < 1s —
   * the bound is a product decision, not a test threshold, and the fallback
   * (tokens: null, streamed in) is already contract-legal.
   */
  it('measures cold-start token counting for 500 documents (plan A2)', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 500; i++) {
      // ~5KB of varied text per doc, matching the plan's "500 × ~5KB" estimate.
      files[`docs/doc-${i}.md`] = `# Document ${i}\n\n${'Lorem ipsum dolor sit amet. '.repeat(180)}`;
    }
    const git = new MockGitClient({ files });
    const counter = new DocumentTokenCounter(git, new TiktokenTokenizer());
    const paths = Object.keys(files);

    const start = performance.now();
    const counts = await mapWithConcurrency(paths, DOC_READ_CONCURRENCY, (p) => counter.countPath(ref, p));
    const elapsedMs = performance.now() - start;

    expect(counts).toHaveLength(500);
    expect(counts.every((c) => typeof c === 'number' && c! > 0)).toBe(true);
    // eslint-disable-next-line no-console
    console.log(`[project-context A2] 500-document cold-start token count: ${elapsedMs.toFixed(1)}ms`);
  });
});
