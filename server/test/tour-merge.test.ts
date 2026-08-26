/**
 * `mergeAnnotations` (R24, C14, C16, C17) — the merge IS the success path.
 * A24/A26.
 */
import { describe, it, expect } from 'vitest';
import { mergeAnnotations } from '../src/modules/tour/merge.js';
import { buildSkeleton } from '../src/modules/tour/derive/skeleton.js';
import { buildTree } from '../src/modules/tour/derive/tree.js';
import { buildDiagram } from '../src/modules/tour/derive/diagram.js';
import { buildChains } from '../src/modules/tour/derive/chains.js';
import { buildReading } from '../src/modules/tour/derive/reading.js';
import type { TourAnnotations } from '../src/modules/tour/schemas.js';
import type { OnboardingSection } from '@devdigest/shared';

function nullAnnotations(): TourAnnotations {
  return { architecture: null, critical_paths: null, how_to_run: null, guided_reading: null, first_tasks: null };
}

function skeletonFixture(): OnboardingSection[] {
  const tree = buildTree([
    { path: 'src/a.ts', percentile: 90 },
    { path: 'src/b.ts', percentile: 50 },
  ]);
  const diagram = buildDiagram([{ fromFile: 'src/a.ts', toFile: 'src/b.ts' }]);
  const chains = buildChains([['src/a.ts', 'src/b.ts']], []);
  const reading = buildReading(['src/a.ts', 'src/b.ts'], new Set(['src/a.ts', 'src/b.ts']), (p) =>
    p === 'src/a.ts' ? 90 : 50,
  );
  return buildSkeleton({
    tree,
    diagram,
    chains,
    reading,
    config: {
      packageManager: 'pnpm',
      scripts: ['dev'],
      envExampleVars: [],
      envExampleFile: null,
      composeServices: [],
      dockerfilePresent: false,
      whitelist: ['pnpm install', 'pnpm dev'],
      skeletonSteps: ['pnpm install', 'pnpm dev'],
    },
    candidates: [
      {
        candidate: { candidate_id: 'c1', kind: 'missing_test', scope: 'src/b.ts', line: null, snippet: 'x', why: null },
        callers: 1,
        rankPercentile: 30,
      },
    ],
  });
}

describe('mergeAnnotations', () => {
  it('every key null → the whole record is the skeleton, all five kinds skeleton_sections', () => {
    const { sections, skeletonSections } = mergeAnnotations(skeletonFixture(), nullAnnotations());
    expect(skeletonSections.sort()).toEqual(
      ['architecture_overview', 'critical_paths', 'how_to_run', 'guided_reading', 'first_tasks'].sort(),
    );
    expect(sections.every((s) => s.skeleton === true)).toBe(true);
  });

  it('A26 — how_to_run: null skeletonises ONLY that section; the other four are annotated', () => {
    const annotations: TourAnnotations = {
      architecture: { body: 'Some architecture prose.', dirs: [] },
      critical_paths: [{ chain_id: 'chain_0_src_a_ts', why: 'the main chain' }],
      how_to_run: null,
      guided_reading: [{ path: 'src/a.ts', why: 'start here' }],
      first_tasks: [{ candidate_id: 'c1', title: 'Write a test', why: 'no coverage yet' }],
    };
    const { sections, skeletonSections } = mergeAnnotations(skeletonFixture(), annotations);
    expect(skeletonSections).toEqual(['how_to_run']);
    const howToRun = sections.find((s) => s.kind === 'how_to_run')!;
    expect(howToRun.skeleton).toBe(true);
    expect(howToRun.run_steps!.map((s) => s.command)).toEqual(['pnpm install', 'pnpm dev']); // untouched fixed order
    const architecture = sections.find((s) => s.kind === 'architecture_overview')!;
    expect(architecture.skeleton).toBe(false);
    expect(architecture.body).toBe('Some architecture prose.');
  });

  it('A24 — guided_reading keeps the SKELETON order even when the response reverses it', () => {
    const annotations: TourAnnotations = {
      ...nullAnnotations(),
      guided_reading: [
        { path: 'src/b.ts', why: 'second thing to read' },
        { path: 'src/a.ts', why: 'first thing to read' },
      ],
    };
    const { sections } = mergeAnnotations(skeletonFixture(), annotations);
    const reading = sections.find((s) => s.kind === 'guided_reading')!;
    // Skeleton order is rank-descending: src/a.ts (90) then src/b.ts (50).
    expect(reading.reading!.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(reading.reading!.find((r) => r.path === 'src/a.ts')!.why).toBe('first thing to read');
  });

  it("C-1 — how_to_run's order and selection are the MODEL's on success", () => {
    const annotations: TourAnnotations = {
      ...nullAnnotations(),
      how_to_run: {
        body: 'Run it like this.',
        steps: [
          { command: 'pnpm dev', why: 'start the dev server' },
          { command: 'pnpm install', why: 'install deps first' },
        ],
      },
    };
    const { sections } = mergeAnnotations(skeletonFixture(), annotations);
    const howToRun = sections.find((s) => s.kind === 'how_to_run')!;
    // The MODEL's order (dev, then install) — NOT the skeleton's fixed
    // install-then-dev order.
    expect(howToRun.run_steps!.map((s) => s.command)).toEqual(['pnpm dev', 'pnpm install']);
  });

  it('a task title may be rewritten by the model; a task not returned still renders from the skeleton', () => {
    const annotations: TourAnnotations = {
      ...nullAnnotations(),
      first_tasks: [{ candidate_id: 'c1', title: 'Add coverage for src/b.ts', why: 'currently untested' }],
    };
    const { sections } = mergeAnnotations(skeletonFixture(), annotations);
    const tasks = sections.find((s) => s.kind === 'first_tasks')!;
    expect(tasks.tasks![0]!.title).toBe('Add coverage for src/b.ts');
    expect(tasks.tasks![0]!.why).toBe('currently untested');
  });
});
