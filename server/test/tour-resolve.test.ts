/**
 * `resolveSections` (R11) — re-resolves every stored path against the
 * CURRENT index on every `GET`, without persisting anything.
 */
import { describe, it, expect } from 'vitest';
import { resolveSections } from '../src/modules/tour/resolve.js';
import type { OnboardingSection } from '@devdigest/shared';

describe('resolveSections', () => {
  it('C12 — a stored path absent from the current index resolves false; a present one resolves true', () => {
    const sections: OnboardingSection[] = [
      {
        kind: 'guided_reading',
        title: 't',
        body: null,
        diagram: null,
        links: [],
        reading: [
          { path: 'src/gone.ts', why: null, rank_percentile: 90, resolved: true },
          { path: 'src/still-here.ts', why: null, rank_percentile: 50, resolved: true },
        ],
      },
    ];
    const [result] = resolveSections(sections, ['src/still-here.ts']);
    expect(result!.reading!.map((r) => r.resolved)).toEqual([false, true]);
  });

  it('resolves each file in a critical-path chain independently', () => {
    const sections: OnboardingSection[] = [
      {
        kind: 'critical_paths',
        title: 't',
        body: null,
        diagram: null,
        links: [],
        paths: [{ chain_id: 'c0', files: ['src/a.ts', 'src/b.ts'], endpoints: [], why: null, resolved: [true, true] }],
      },
    ];
    const [result] = resolveSections(sections, ['src/a.ts']);
    expect(result!.paths![0]!.resolved).toEqual([true, false]);
  });

  it('resolves a first-task candidate by its scope', () => {
    const sections: OnboardingSection[] = [
      {
        kind: 'first_tasks',
        title: 't',
        body: null,
        diagram: null,
        links: [],
        tasks: [
          {
            candidate_id: 'c1',
            title: 't',
            scope: 'src/removed.ts',
            why: null,
            difficulty: 'low',
            difficulty_basis: { callers: 0, rank_percentile: null, signal: 'no_index_signal' },
            resolved: true,
          },
        ],
      },
    ];
    const [result] = resolveSections(sections, []);
    expect(result!.tasks![0]!.resolved).toBe(false);
  });

  it('normalises a stray "./" on both sides so it does not falsely resolve to false', () => {
    const sections: OnboardingSection[] = [
      {
        kind: 'guided_reading',
        title: 't',
        body: null,
        diagram: null,
        links: [],
        reading: [{ path: './src/a.ts', why: null, rank_percentile: null, resolved: true }],
      },
    ];
    const [result] = resolveSections(sections, ['src/a.ts']);
    expect(result!.reading![0]!.resolved).toBe(true);
  });

  it('never triggers regeneration — it is a pure projection, no I/O', () => {
    const sections: OnboardingSection[] = [
      { kind: 'architecture_overview', title: 't', body: null, diagram: null, links: [] },
    ];
    const result = resolveSections(sections, []);
    expect(result).toEqual(sections);
  });
});
