import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverDocuments } from '../../src/modules/project-context/discovery.js';
import { MAX_DOCUMENTS } from '../../src/modules/project-context/constants.js';
import { MAX_FILE_SIZE } from '../../src/modules/_shared/walk-limits.js';

/**
 * Hermetic — a real temp directory standing in for a clone, no DB, no
 * container. `discoverDocuments` takes a root path directly (plan A1: "the
 * walk is a local `readdir` recursion", reached via `container.git.
 * clonePathFor(repo)` in the service — never exercised here).
 */
describe('discoverDocuments', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'devdigest-context-'));
    await writeFile(join(root, 'README.md'), '# hello');
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, 'docs', 'a.md'), '# a');
    await mkdir(join(root, 'node_modules', 'x'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'x', 'b.md'), '# excluded');
    // Not a doc extension — should never appear.
    await writeFile(join(root, 'notes.txt'), 'plain text');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns every .md file outside excluded dirs, with repo-relative paths (A1)', async () => {
    const { docs, truncated } = await discoverDocuments(root);
    const paths = docs.map((d) => d.path).sort();
    expect(paths).toEqual(['README.md', 'docs/a.md']);
    expect(truncated).toBe(false);
    for (const d of docs) expect(d.tooLarge).toBe(false);
  });

  it('never follows a symlinked .md file', async () => {
    const linkPath = join(root, 'linked.md');
    await symlink(join(root, 'README.md'), linkPath);
    try {
      const { docs } = await discoverDocuments(root);
      expect(docs.map((d) => d.path)).not.toContain('linked.md');
    } finally {
      await rm(linkPath, { force: true });
    }
  });

  it('marks a document over the size ceiling as too_large without dropping it (C4)', async () => {
    const big = await mkdtemp(join(tmpdir(), 'devdigest-context-big-'));
    try {
      await writeFile(join(big, 'CHANGELOG.md'), Buffer.alloc(MAX_FILE_SIZE + 1, 'x'));
      const { docs } = await discoverDocuments(big);
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({ path: 'CHANGELOG.md', tooLarge: true });
    } finally {
      await rm(big, { recursive: true, force: true });
    }
  });

  it('truncates past MAX_DOCUMENTS and reports it (C3)', async () => {
    const many = await mkdtemp(join(tmpdir(), 'devdigest-context-many-'));
    try {
      const count = MAX_DOCUMENTS + 5;
      await Promise.all(
        Array.from({ length: count }, (_, i) => writeFile(join(many, `f${String(i).padStart(5, '0')}.md`), 'x')),
      );
      const { docs, truncated } = await discoverDocuments(many);
      expect(docs).toHaveLength(MAX_DOCUMENTS);
      expect(truncated).toBe(true);
    } finally {
      await rm(many, { recursive: true, force: true });
    }
  });

  it('discovers .markdown too (spec Q2), never .mdx', async () => {
    const mixed = await mkdtemp(join(tmpdir(), 'devdigest-context-mixed-'));
    try {
      await writeFile(join(mixed, 'guide.markdown'), '# guide');
      await writeFile(join(mixed, 'component.mdx'), '# jsx');
      const { docs } = await discoverDocuments(mixed);
      expect(docs.map((d) => d.path)).toEqual(['guide.markdown']);
    } finally {
      await rm(mixed, { recursive: true, force: true });
    }
  });
});
