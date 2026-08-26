/**
 * `buildSkeleton` (R24) — the base case, not an error path. A9's derivation
 * half: every derived collection non-empty on a realistic fixture, every
 * `body`/`why`/`note` null. C7: zero candidates → `empty_reason`, never an
 * invented one.
 */
import { describe, it, expect } from 'vitest';
import { buildSkeleton, type SkeletonInput } from '../src/modules/tour/derive/skeleton.js';
import { buildTree } from '../src/modules/tour/derive/tree.js';
import { buildDiagram } from '../src/modules/tour/derive/diagram.js';
import { buildChains } from '../src/modules/tour/derive/chains.js';
import { buildReading } from '../src/modules/tour/derive/reading.js';
import type { DerivedCandidate } from '../src/modules/tour/derive/candidates.js';

function fixture(): SkeletonInput {
  const tree = buildTree([
    { path: 'src/api/route.ts', percentile: 95 },
    { path: 'src/service.ts', percentile: 80 },
    { path: 'src/util.ts', percentile: 40 },
  ]);
  const diagram = buildDiagram([{ fromFile: 'src/api/route.ts', toFile: 'src/service.ts' }]);
  const chains = buildChains(
    [['src/api/route.ts', 'src/service.ts']],
    [{ filePath: 'src/api/route.ts', endpoints: ['GET /x'], crons: [] }],
  );
  const reading = buildReading(
    ['src/api/route.ts', 'src/service.ts'],
    new Set(['src/api/route.ts', 'src/service.ts']),
    (p) => (p === 'src/api/route.ts' ? 95 : 80),
  );
  const candidates: DerivedCandidate[] = [
    { candidate_id: 'missing_test_src/util.ts', kind: 'missing_test', scope: 'src/util.ts', line: null, snippet: 'x', why: null },
  ];
  return {
    tree,
    diagram,
    chains,
    config: {
      packageManager: 'pnpm',
      scripts: ['dev'],
      envExampleVars: [],
      envExampleFile: '.env.example',
      composeServices: [],
      dockerfilePresent: false,
      whitelist: ['pnpm install', 'cp .env.example .env', 'pnpm dev'],
      skeletonSteps: ['pnpm install', 'cp .env.example .env', 'pnpm dev'],
    },
    reading,
    candidates: candidates.map((candidate) => ({ candidate, callers: 1, rankPercentile: 30 })),
  };
}

describe('buildSkeleton', () => {
  it('A9 — every derived collection non-empty, every prose field null', () => {
    const sections = buildSkeleton(fixture());
    expect(sections).toHaveLength(5);

    const arch = sections.find((s) => s.kind === 'architecture_overview')!;
    expect(arch.tree!.length).toBeGreaterThan(0);
    expect(arch.diagram).not.toBeNull();
    expect(arch.body).toBeNull();
    expect(arch.tree!.every((t) => t.note === null)).toBe(true);

    const paths = sections.find((s) => s.kind === 'critical_paths')!;
    expect(paths.paths!.length).toBeGreaterThan(0);
    expect(paths.paths!.every((p) => p.why === null)).toBe(true);

    const howToRun = sections.find((s) => s.kind === 'how_to_run')!;
    expect(howToRun.run_steps!.length).toBeGreaterThan(0);
    expect(howToRun.run_steps!.every((s) => s.why === null)).toBe(true);
    expect(howToRun.body).toBeNull();

    const reading = sections.find((s) => s.kind === 'guided_reading')!;
    expect(reading.reading!.length).toBeGreaterThan(0);
    expect(reading.reading!.every((r) => r.why === null)).toBe(true);

    const tasks = sections.find((s) => s.kind === 'first_tasks')!;
    expect(tasks.tasks!.length).toBeGreaterThan(0);
    expect(tasks.tasks!.every((t) => t.why === null)).toBe(true);
    expect(tasks.tasks!.every((t) => typeof t.difficulty === 'string')).toBe(true);

    expect(sections.every((s) => s.skeleton === true)).toBe(true);
  });

  it('C7 — zero candidates → empty_reason on first_tasks, not an invented task', () => {
    const input = fixture();
    input.candidates = [];
    const sections = buildSkeleton(input);
    const tasks = sections.find((s) => s.kind === 'first_tasks')!;
    expect(tasks.tasks).toEqual([]);
    expect(tasks.empty_reason).toBeTruthy();
  });

  it('caps first_tasks at 6, sorted by difficulty ascending', () => {
    const input = fixture();
    input.candidates = Array.from({ length: 10 }, (_, i) => ({
      candidate: {
        candidate_id: `c${i}`,
        kind: 'missing_test' as const,
        scope: `src/f${i}.ts`,
        line: null,
        snippet: 'x',
        why: null,
      },
      callers: i > 5 ? 20 : 0, // last few are "high", rest "low"
      rankPercentile: 10,
    }));
    const sections = buildSkeleton(input);
    const tasks = sections.find((s) => s.kind === 'first_tasks')!;
    expect(tasks.tasks!.length).toBe(6);
    const difficulties = tasks.tasks!.map((t) => t.difficulty);
    const order = { low: 0, medium: 1, high: 2 };
    for (let i = 1; i < difficulties.length; i += 1) {
      expect(order[difficulties[i]!]).toBeGreaterThanOrEqual(order[difficulties[i - 1]!]);
    }
  });
});
