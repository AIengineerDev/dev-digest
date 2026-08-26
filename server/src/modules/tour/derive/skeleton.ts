/**
 * The skeleton (R24) — assembles `derive/{tree,diagram,chains,config,reading,
 * candidates,difficulty}.ts` into a COMPLETE `OnboardingSection[]`, all five
 * kinds populated, every `body`/`why`/`note` `null`.
 *
 * This is the success path's BASE CASE, not an error path (spec Trap 2): the
 * server always has something to show before any model call is even
 * attempted. `merge.ts` (A4.4) layers annotations on top of exactly this
 * shape; it never replaces it.
 */
import type { OnboardingSection } from '@devdigest/shared';
import type { DerivedTreeEntry } from './tree.js';
import type { ChainsResult } from './chains.js';
import type { ConfigDerivation } from './config.js';
import type { ReadingResult } from './reading.js';
import type { DerivedCandidate } from './candidates.js';
import { computeDifficulty } from './difficulty.js';

const DIFFICULTY_ORDER = { low: 0, medium: 1, high: 2 } as const;
export const MAX_SKELETON_TASKS = 6;

export interface CandidateWithSignal {
  candidate: DerivedCandidate;
  /** Distinct caller-file count from `getBlastRadius(repoId, [scope])`. */
  callers: number;
  /** `file_rank.percentile` for the candidate's `scope`, or `null`. */
  rankPercentile: number | null;
}

export interface SkeletonInput {
  tree: readonly DerivedTreeEntry[];
  diagram: string | null;
  chains: ChainsResult;
  config: ConfigDerivation;
  reading: ReadingResult;
  candidates: readonly CandidateWithSignal[];
}

function titleFor(candidate: DerivedCandidate): string {
  switch (candidate.kind) {
    case 'missing_test':
      return `Add a test for ${candidate.scope}`;
    case 'todo_marker':
      return `Resolve the marker at ${candidate.scope}${candidate.line ? ':' + candidate.line : ''}`;
    case 'unresolved_reference':
      return `Track down the unresolved reference in ${candidate.scope}`;
    case 'undocumented_endpoint':
      return `Document the endpoint declared in ${candidate.scope}`;
  }
}

export function buildSkeleton(input: SkeletonInput): OnboardingSection[] {
  const architecture: OnboardingSection = {
    kind: 'architecture_overview',
    title: 'Architecture overview',
    body: null,
    diagram: input.diagram,
    links: [],
    tree: input.tree.map((e) => ({
      path: e.path,
      files: e.files,
      role_mix: e.role_mix,
      top_file: e.top_file,
      note: null,
    })),
    empty_reason: input.tree.length === 0 ? 'No indexed files to build a directory tree from.' : null,
    skeleton: true,
  };

  const criticalPaths: OnboardingSection = {
    kind: 'critical_paths',
    title: 'Critical paths',
    body: null,
    diagram: null,
    links: [],
    paths: input.chains.chains.map((c) => ({
      chain_id: c.chain_id,
      files: c.files,
      endpoints: c.endpoints,
      why: null,
      resolved: c.files.map(() => true),
    })),
    empty_reason: input.chains.emptyReason,
    skeleton: true,
  };

  const howToRun: OnboardingSection = {
    kind: 'how_to_run',
    title: 'How to run',
    body: null,
    diagram: null,
    links: [],
    run_steps: input.config.skeletonSteps.map((command) => ({ command, why: null })),
    empty_reason: input.config.skeletonSteps.length === 0 ? 'No runnable commands were found in this repo.' : null,
    skeleton: true,
  };

  const guidedReading: OnboardingSection = {
    kind: 'guided_reading',
    title: 'Guided reading',
    body: null,
    diagram: null,
    links: [],
    reading: input.reading.reading.map((r) => ({
      path: r.path,
      why: null,
      rank_percentile: r.rank_percentile,
      resolved: r.resolved,
    })),
    empty_reason: input.reading.emptyReason,
    skeleton: true,
  };

  const ranked = input.candidates
    .map((c) => ({ ...c, ...computeDifficulty(c.callers, c.rankPercentile) }))
    .sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty])
    .slice(0, MAX_SKELETON_TASKS);

  const firstTasks: OnboardingSection = {
    kind: 'first_tasks',
    title: 'First tasks',
    body: null,
    diagram: null,
    links: [],
    tasks: ranked.map((r) => ({
      candidate_id: r.candidate.candidate_id,
      title: titleFor(r.candidate),
      scope: r.candidate.scope,
      why: null,
      difficulty: r.difficulty,
      difficulty_basis: r.basis,
      resolved: true,
    })),
    empty_reason: ranked.length === 0 ? 'No starter tasks were found in this repo.' : null,
    skeleton: true,
  };

  return [architecture, criticalPaths, howToRun, guidedReading, firstTasks];
}
