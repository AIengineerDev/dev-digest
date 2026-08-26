/**
 * `derive/candidates.ts`'s four generators (R8), and A4's C16 — an
 * unsupplied `candidate_id` is dropped while the derived candidate still
 * renders, skeleton-style.
 */
import { describe, it, expect } from 'vitest';
import { buildCandidates, MAX_CANDIDATES, TODO_GREP_TIMEOUT_MS } from '../src/modules/tour/derive/candidates.js';
import { filterAnnotations } from '../src/modules/tour/grounding.js';
import { mergeAnnotations } from '../src/modules/tour/merge.js';
import { buildSkeleton } from '../src/modules/tour/derive/skeleton.js';
import type { TourAnnotations } from '../src/modules/tour/schemas.js';

describe('buildCandidates', () => {
  it('missing_test — a core file with no matching test is a candidate; a tested one is not', async () => {
    const result = await buildCandidates({
      allFiles: ['src/util.ts', 'src/util.test.ts', 'src/other.ts'],
      unresolvedRefs: [],
      endpointFacts: [],
      documentedFiles: new Set(),
      grep: async () => [],
    });
    const kinds = result.map((c) => `${c.kind}:${c.scope}`);
    expect(kinds).toContain('missing_test:src/other.ts');
    expect(kinds).not.toContain('missing_test:src/util.ts');
  });

  it('todo_marker — one candidate per grep match', async () => {
    const result = await buildCandidates({
      allFiles: [],
      unresolvedRefs: [],
      endpointFacts: [],
      documentedFiles: new Set(),
      grep: async () => [{ path: 'src/x.ts', line: 12, text: '// TODO: fix this' }],
    });
    expect(result).toEqual([
      { candidate_id: 'todo_marker_src/x.ts_12', kind: 'todo_marker', scope: 'src/x.ts', line: 12, snippet: '// TODO: fix this', why: null },
    ]);
  });

  it('a throwing grep yields ZERO candidates from todo_marker only — the other three still run', async () => {
    const result = await buildCandidates({
      allFiles: ['src/orphan.ts'],
      unresolvedRefs: [],
      endpointFacts: [],
      documentedFiles: new Set(),
      grep: async () => {
        throw new Error('ripgrep crashed');
      },
    });
    expect(result.some((c) => c.kind === 'todo_marker')).toBe(false);
    expect(result.some((c) => c.kind === 'missing_test')).toBe(true);
  });

  it('a grep that never resolves is treated the same as a throw (its own timeout)', async () => {
    const result = await buildCandidates({
      allFiles: [],
      unresolvedRefs: [],
      endpointFacts: [],
      documentedFiles: new Set(),
      grep: () => new Promise(() => {}), // never resolves
    });
    expect(result).toEqual([]);
  }, TODO_GREP_TIMEOUT_MS + 2_000);

  it('unresolved_reference — one candidate per unresolved ref, scoped to its file', async () => {
    const result = await buildCandidates({
      allFiles: [],
      unresolvedRefs: [{ refFile: 'src/x.ts', refLine: 5, symbolName: 'doThing' }],
      endpointFacts: [],
      documentedFiles: new Set(),
      grep: async () => [],
    });
    expect(result).toEqual([
      {
        candidate_id: 'unresolved_reference_src/x.ts_5_doThing',
        kind: 'unresolved_reference',
        scope: 'src/x.ts',
        line: 5,
        snippet: 'doThing(…) — unresolved at src/x.ts:5',
        why: null,
      },
    ]);
  });

  it('undocumented_endpoint — an endpoint file not mentioned in any discovered doc is a candidate; a documented one is not', async () => {
    const result = await buildCandidates({
      allFiles: [],
      unresolvedRefs: [],
      endpointFacts: [
        { filePath: 'src/api/undocumented.ts', endpoints: ['GET /a'] },
        { filePath: 'src/api/documented.ts', endpoints: ['GET /b'] },
      ],
      documentedFiles: new Set(['src/api/documented.ts']),
      grep: async () => [],
    });
    const scopes = result.map((c) => c.scope);
    expect(scopes).toContain('src/api/undocumented.ts');
    expect(scopes).not.toContain('src/api/documented.ts');
  });

  it('caps at MAX_CANDIDATES total across all four generators', async () => {
    const allFiles = Array.from({ length: 30 }, (_, i) => `src/core/f${i}.ts`);
    const result = await buildCandidates({
      allFiles,
      unresolvedRefs: [],
      endpointFacts: [],
      documentedFiles: new Set(),
      grep: async () => [],
    });
    expect(result.length).toBe(MAX_CANDIDATES);
  });
});

describe('A4/C16 — an unsupplied candidate_id is dropped, the derived candidate still renders', () => {
  it('cand_zz is dropped by filterAnnotations before the merge ever sees it; the skeleton task renders unchanged', () => {
    const skeleton = buildSkeleton({
      tree: [],
      diagram: null,
      chains: { chains: [], emptyReason: 'none' },
      config: {
        packageManager: 'npm',
        scripts: [],
        envExampleVars: [],
        envExampleFile: null,
        composeServices: [],
        dockerfilePresent: false,
        whitelist: [],
        skeletonSteps: [],
      },
      reading: { reading: [], emptyReason: 'none' },
      candidates: [
        {
          candidate: { candidate_id: 'c1', kind: 'missing_test', scope: 'src/util.ts', line: null, snippet: 'x', why: null },
          callers: 0,
          rankPercentile: null,
        },
      ],
    });

    const rawAnnotations: TourAnnotations = {
      architecture: null,
      critical_paths: null,
      how_to_run: null,
      guided_reading: null,
      first_tasks: [
        { candidate_id: 'c1', title: 'Add a test for src/util.ts', why: 'no coverage' },
        { candidate_id: 'cand_zz', title: 'Invented task', why: 'the model made this up' },
      ],
    };

    const filtered = filterAnnotations(rawAnnotations, {
      treeDirs: new Set(),
      chainIds: new Set(),
      readingPaths: new Set(),
      candidateIds: new Set(['c1']),
    });
    expect(filtered.dropped).toContain('cand_zz');

    const { sections } = mergeAnnotations(skeleton, filtered.annotations);
    const tasks = sections.find((s) => s.kind === 'first_tasks')!;
    expect(tasks.tasks!.map((t) => t.candidate_id)).toEqual(['c1']);
    expect(tasks.tasks![0]!.title).toBe('Add a test for src/util.ts');
  });
});
