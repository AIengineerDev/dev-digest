/**
 * `grounding.ts`'s four gates — `groundPaths` (R10, A2), `applyDifficulty`
 * (R9, A5's override half), and `filterAnnotations` (R8, C16). `filterSteps`
 * has its own `tour-steps.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { groundPaths, applyDifficulty, filterAnnotations } from '../src/modules/tour/grounding.js';
import { compareBudgetToBilled } from '../src/modules/tour/service.js';
import type { OnboardingSection } from '@devdigest/shared';

function section(overrides: Partial<OnboardingSection> & { kind: OnboardingSection['kind'] }): OnboardingSection {
  return { title: 't', body: null, diagram: null, links: [], ...overrides } as OnboardingSection;
}

describe('groundPaths (A2 / R10)', () => {
  it('drops a link to a path outside the reference set, keeps a resolvable one', () => {
    const sections = [
      section({
        kind: 'architecture_overview',
        links: [
          { label: 'a', path: 'src/real.ts' },
          { label: 'b', path: 'src/does-not-exist.ts' },
        ],
      }),
    ];
    const result = groundPaths(sections, ['src/real.ts']);
    expect(result.sections[0]!.links).toEqual([{ label: 'a', path: 'src/real.ts' }]);
    expect(result.droppedRefs).toBe(1);
  });

  it('cross-model review C-2 — a backticked unresolvable path INSIDE body prose is stripped and counted', () => {
    const sections = [
      section({
        kind: 'architecture_overview',
        body: 'See `src/real.ts` and also `src/gone.ts` for details.',
      }),
    ];
    const result = groundPaths(sections, ['src/real.ts']);
    expect(result.sections[0]!.body).toContain('`src/real.ts`');
    expect(result.sections[0]!.body).not.toContain('src/gone.ts');
    expect(result.droppedRefs).toBe(1);
    expect(result.dropped).toContain('src/gone.ts');
  });

  it('normalises a stray "./" so it cannot drop every ref', () => {
    const sections = [section({ kind: 'architecture_overview', links: [{ label: 'a', path: './src/real.ts' }] })];
    const result = groundPaths(sections, ['src/real.ts']);
    expect(result.sections[0]!.links).toHaveLength(1);
    expect(result.droppedRefs).toBe(0);
  });

  it('grounds critical_paths[].why and guided_reading[].why for backticked paths', () => {
    const sections = [
      section({
        kind: 'critical_paths',
        paths: [{ chain_id: 'c0', files: ['a.ts'], endpoints: [], why: 'goes through `b.ts`', resolved: [true] }],
      }),
      section({
        kind: 'guided_reading',
        reading: [{ path: 'a.ts', why: 'see `b.ts` first', rank_percentile: 90, resolved: true }],
      }),
    ];
    const result = groundPaths(sections, ['a.ts']);
    const paths = result.sections.find((s) => s.kind === 'critical_paths')!;
    const reading = result.sections.find((s) => s.kind === 'guided_reading')!;
    expect(paths.paths![0]!.why).not.toContain('b.ts');
    expect(reading.reading![0]!.why).not.toContain('b.ts');
    expect(result.droppedRefs).toBe(2);
  });
});

describe('applyDifficulty (A5 override half)', () => {
  it('overwrites unconditionally from the truth map, ignoring any other difficulty on the task', () => {
    const sections = [
      section({
        kind: 'first_tasks',
        tasks: [
          {
            candidate_id: 'c1',
            title: 't',
            scope: 'src/a.ts',
            why: null,
            difficulty: 'high', // pretend something upstream set this wrong
            difficulty_basis: { callers: 1, rank_percentile: 31, signal: 'indexed' },
            resolved: true,
          },
        ],
      }),
    ];
    const truth = new Map([
      ['c1', { difficulty: 'low' as const, basis: { callers: 1, rank_percentile: 31, signal: 'indexed' as const } }],
    ]);
    const result = applyDifficulty(sections, truth);
    expect(result[0]!.tasks![0]!.difficulty).toBe('low');
  });
});

describe('filterAnnotations (R8, C16)', () => {
  it('drops an annotation keyed to an unsupplied id in every section', () => {
    const known = {
      treeDirs: new Set(['src']),
      chainIds: new Set(['chain_0']),
      readingPaths: new Set(['src/a.ts']),
      candidateIds: new Set(['c1']),
    };
    const annotations = {
      architecture: { body: 'x', dirs: [{ path: 'src', note: 'ok' }, { path: 'unknown', note: 'bad' }] },
      critical_paths: [{ chain_id: 'chain_0', why: 'ok' }, { chain_id: 'chain_zz', why: 'bad' }],
      how_to_run: null,
      guided_reading: [{ path: 'src/a.ts', why: 'ok' }, { path: 'src/unknown.ts', why: 'bad' }],
      first_tasks: [{ candidate_id: 'c1', title: 'ok', why: null }, { candidate_id: 'cand_zz', title: 'bad', why: null }],
    };
    const result = filterAnnotations(annotations, known);
    expect(result.annotations.architecture!.dirs).toEqual([{ path: 'src', note: 'ok' }]);
    expect(result.annotations.critical_paths).toEqual([{ chain_id: 'chain_0', why: 'ok' }]);
    expect(result.annotations.guided_reading).toEqual([{ path: 'src/a.ts', why: 'ok' }]);
    expect(result.annotations.first_tasks).toEqual([{ candidate_id: 'c1', title: 'ok', why: null }]);
    expect(result.droppedRefs).toBe(4);
  });
});

describe('compareBudgetToBilled (A18 helper)', () => {
  it('boundary cases: exactly 15% over/under are within tolerance, just past is not', () => {
    expect(compareBudgetToBilled(1000, 1150).withinTolerance).toBe(true);
    expect(compareBudgetToBilled(1000, 850).withinTolerance).toBe(true);
    expect(compareBudgetToBilled(1000, 1151).withinTolerance).toBe(false);
    expect(compareBudgetToBilled(1000, 849).withinTolerance).toBe(false);
  });
});
