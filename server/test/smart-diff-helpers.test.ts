import { describe, it, expect } from 'vitest';
import {
  buildSmartDiff,
  classifyPath,
  groupFiles,
  suggestSplit,
  type ClassifiableFile,
} from '../src/modules/smart-diff/helpers.js';
import {
  SPLIT_MAX_REVIEWABLE_FILES,
  SPLIT_MAX_REVIEWABLE_LINES,
} from '../src/modules/smart-diff/constants.js';

/**
 * The whole of Smart Diff's judgement is here: a path becomes a role, roles
 * become an order, and size becomes advice. None of it needs a database or a
 * model, so none of it is tested through the route.
 */

const file = (path: string, additions = 10, deletions = 0): ClassifiableFile => ({
  path,
  additions,
  deletions,
});

const noFindings = new Map<string, number[]>();

describe('classifyPath', () => {
  it.each([
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'client/pnpm-lock.yaml',
    'Cargo.lock',
    'go.sum',
  ])('always classifies the lock file %s as boilerplate', (path) => {
    expect(classifyPath(path)).toBe('boilerplate');
  });

  it.each([
    'dist/index.js',
    'server/dist/modules/pulls/routes.js',
    'src/__snapshots__/App.test.tsx.snap',
    'src/api.generated.ts',
    'server/src/db/migrations/0014_add_thing.sql',
    'public/bundle.min.js',
  ])('classifies the generated artefact %s as boilerplate', (path) => {
    expect(classifyPath(path)).toBe('boilerplate');
  });

  it.each([
    'src/api/public/index.ts',
    'src/server.ts',
    'src/config.ts',
    'vitest.config.ts',
    'tsconfig.json',
    '.github/workflows/ci.yml',
    'Dockerfile',
    '.env.example',
    '.eslintrc.json',
  ])('classifies the plumbing file %s as wiring', (path) => {
    expect(classifyPath(path)).toBe('wiring');
  });

  it.each([
    'src/middleware/ratelimit.ts',
    'src/api/public/webhooks.ts',
    'server/src/modules/pulls/service.ts',
    'client/src/components/FileCard/FileCard.tsx',
    'README.md',
  ])('classifies the authored file %s as core', (path) => {
    expect(classifyPath(path)).toBe('core');
  });

  it('resolves a file that is both a lock file and a config in favour of boilerplate', () => {
    // package.json matches the manifest rule (boilerplate) and would also read
    // as configuration; ROLE_ORDER is what makes this answer stable.
    expect(classifyPath('package.json')).toBe('boilerplate');
  });

  it('treats a Windows-style path the same as a POSIX one', () => {
    expect(classifyPath('server\\dist\\index.js')).toBe('boilerplate');
    expect(classifyPath('./package-lock.json')).toBe('boilerplate');
  });
});

describe('groupFiles', () => {
  it('emits core, wiring and boilerplate in that order, even when a group is empty', () => {
    const groups = groupFiles([file('package-lock.json')], noFindings);
    expect(groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(groups[0]!.files).toEqual([]);
    expect(groups[2]!.files.map((f) => f.path)).toEqual(['package-lock.json']);
  });

  it('orders a group by findings first, then by size, then by path', () => {
    const files = [
      file('src/small.ts', 2, 0),
      file('src/huge.ts', 300, 20),
      file('src/flagged.ts', 5, 0),
      file('src/also-huge.ts', 300, 20),
    ];
    const findings = new Map([['src/flagged.ts', [12]]]);
    const [core] = groupFiles(files, findings);
    expect(core!.files.map((f) => f.path)).toEqual([
      'src/flagged.ts', // one finding beats every size
      'src/also-huge.ts', // 320 lines, alphabetically before src/huge.ts
      'src/huge.ts',
      'src/small.ts',
    ]);
  });

  it('deduplicates and sorts the finding lines it attaches to a file', () => {
    const findings = new Map([['src/a.ts', [73, 61, 61, 68]]]);
    const [core] = groupFiles([file('src/a.ts')], findings);
    expect(core!.files[0]!.finding_lines).toEqual([61, 68, 73]);
  });

  it('leaves pseudocode_summary null — Smart Diff makes no model call', () => {
    const [core] = groupFiles([file('src/a.ts')], noFindings);
    expect(core!.files[0]!.pseudocode_summary).toBeNull();
  });

  it('attaches no finding lines before a review has run', () => {
    const groups = groupFiles([file('src/a.ts'), file('package-lock.json')], noFindings);
    expect(groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
  });
});

describe('suggestSplit', () => {
  it('does not flag a PR whose reviewable change is small, however large the lock diff', () => {
    const groups = groupFiles(
      [file('src/a.ts', 10, 5), file('pnpm-lock.yaml', 4000, 3000)],
      noFindings,
    );
    const split = suggestSplit(groups);
    expect(split.too_big).toBe(false);
    // 15, not 7015 — the verdict and the number it reports are about the same files.
    expect(split.total_lines).toBe(15);
  });

  it('flags a PR past the line threshold and proposes splits by directory', () => {
    const files = [
      file('src/billing/invoice.ts', 200, 0),
      file('src/billing/tax.ts', 150, 0),
      file('src/search/index-builder.ts', 120, 0),
      file('src/search/query.ts', 80, 0),
    ];
    const split = suggestSplit(groupFiles(files, noFindings));
    expect(split.too_big).toBe(true);
    expect(split.total_lines).toBe(550);
    expect(split.total_lines).toBeGreaterThan(SPLIT_MAX_REVIEWABLE_LINES);
    expect(split.proposed_splits).toEqual([
      { name: 'src/billing', files: ['src/billing/invoice.ts', 'src/billing/tax.ts'] },
      { name: 'src/search', files: ['src/search/index-builder.ts', 'src/search/query.ts'] },
    ]);
  });

  it('flags a wide PR on the file count alone', () => {
    const files = Array.from({ length: SPLIT_MAX_REVIEWABLE_FILES + 1 }, (_, i) =>
      file(`src/mod${i}/thing.ts`, 1, 0),
    );
    expect(suggestSplit(groupFiles(files, noFindings)).too_big).toBe(true);
  });

  it('proposes nothing for a big but cohesive PR — one bucket is not a split', () => {
    const files = [
      file('src/billing/invoice.ts', 300, 0),
      file('src/billing/tax.ts', 200, 0),
    ];
    const split = suggestSplit(groupFiles(files, noFindings));
    expect(split.too_big).toBe(true);
    expect(split.proposed_splits).toEqual([]);
  });
});

describe('buildSmartDiff', () => {
  it('produces the contract shape for a realistic PR', () => {
    const files = [
      file('src/middleware/ratelimit.ts', 84, 0),
      file('src/api/public/webhooks.ts', 31, 6),
      file('src/api/public/index.ts', 12, 2),
      file('src/config.ts', 4, 0),
      file('package-lock.json', 92, 24),
    ];
    const findings = new Map([
      ['src/api/public/webhooks.ts', [61, 68, 73]],
      ['src/config.ts', [12]],
    ]);
    const diff = buildSmartDiff(files, findings);

    expect(diff.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(diff.groups[0]!.files.map((f) => f.path)).toEqual([
      'src/api/public/webhooks.ts', // three findings outrank the bigger file
      'src/middleware/ratelimit.ts',
    ]);
    expect(diff.groups[1]!.files.map((f) => f.path)).toEqual([
      'src/config.ts',
      'src/api/public/index.ts',
    ]);
    expect(diff.groups[2]!.files.map((f) => f.path)).toEqual(['package-lock.json']);
    expect(diff.split_suggestion.too_big).toBe(false);
  });
});
