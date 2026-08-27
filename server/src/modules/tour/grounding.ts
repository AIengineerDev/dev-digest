/**
 * Pure grounding gates (R5, R9, R10) — this module's OWN, per-`OnboardingSection`
 * shape (`no-cross-module-internals` forbids importing `modules/brief/grounding.ts`,
 * and the shapes differ anyway).
 */
import type { OnboardingSection, TourDifficulty, TourDifficultyBasis } from '@devdigest/shared';
import { normalizePath } from '../_shared/file-roles.js';
import type { TourAnnotations } from './schemas.js';

export interface GroundPathsResult {
  sections: OnboardingSection[];
  droppedRefs: number;
  dropped: string[];
}

/** A backtick-fenced token that looks like a file path — has a `/` or a
 *  common source/doc extension. */
const BACKTICKED_PATH = /`([^`\n]+(?:\/[^`\n]+|\.(?:[jt]sx?|md|json|ya?ml)))`/g;

function groundText(text: string | null, refs: ReadonlySet<string>, dropped: string[]): string | null {
  if (text === null) return null;
  return text.replace(BACKTICKED_PATH, (whole, path: string) => {
    if (refs.has(normalizePath(path))) return whole;
    dropped.push(path);
    return '';
  });
}

/**
 * `groundPaths` (R10) — every path the model could have written (`links[].path`,
 * reading `why`, chain `why`, task `scope`/`why`, and any backticked path
 * inside a `body`) against the reference set (indexed file list ∪ walked
 * directory list ∪ discovered document paths). Normalises both sides
 * (`brief/grounding.ts:41`'s trick) so a stray `./` cannot drop every ref.
 */
export function groundPaths(sections: readonly OnboardingSection[], referenceFiles: readonly string[]): GroundPathsResult {
  const refs = new Set(referenceFiles.map(normalizePath));
  const dropped: string[] = [];

  const groundLinks = (links: OnboardingSection['links']) =>
    links.filter((l) => {
      const ok = refs.has(normalizePath(l.path));
      if (!ok) dropped.push(l.path);
      return ok;
    });

  const sectionsOut = sections.map((s): OnboardingSection => {
    const body = groundText(s.body, refs, dropped);
    const links = groundLinks(s.links);

    if (s.kind === 'critical_paths' && s.paths) {
      return {
        ...s,
        body,
        links,
        paths: s.paths.map((p) => ({ ...p, why: groundText(p.why, refs, dropped) })),
      };
    }
    if (s.kind === 'how_to_run' && s.run_steps) {
      return { ...s, body, links, run_steps: s.run_steps.map((r) => ({ ...r, why: groundText(r.why, refs, dropped) })) };
    }
    if (s.kind === 'guided_reading' && s.reading) {
      return { ...s, body, links, reading: s.reading.map((r) => ({ ...r, why: groundText(r.why, refs, dropped) })) };
    }
    if (s.kind === 'first_tasks' && s.tasks) {
      return { ...s, body, links, tasks: s.tasks.map((t) => ({ ...t, why: groundText(t.why, refs, dropped) })) };
    }
    return { ...s, body, links };
  });

  return { sections: sectionsOut, droppedRefs: dropped.length, dropped };
}

export interface FilterStepsResult {
  sections: OnboardingSection[];
  droppedSteps: number;
  dropped: string[];
}

/**
 * `filterSteps` (R5) — EXACT verbatim string membership in the whitelist.
 * Not a regex, not a prefix, not a verb allow-list.
 */
export function filterSteps(sections: readonly OnboardingSection[], whitelist: readonly string[]): FilterStepsResult {
  const allowed = new Set(whitelist);
  const dropped: string[] = [];

  const sectionsOut = sections.map((s): OnboardingSection => {
    if (s.kind !== 'how_to_run' || !s.run_steps) return s;
    const runSteps = s.run_steps.filter((step) => {
      const ok = allowed.has(step.command);
      if (!ok) dropped.push(step.command);
      return ok;
    });
    return { ...s, run_steps: runSteps };
  });

  return { sections: sectionsOut, droppedSteps: dropped.length, dropped };
}

export interface FilterAnnotationsResult {
  annotations: TourAnnotations;
  droppedRefs: number;
  dropped: string[];
}

export interface KnownIds {
  treeDirs: ReadonlySet<string>;
  chainIds: ReadonlySet<string>;
  readingPaths: ReadonlySet<string>;
  candidateIds: ReadonlySet<string>;
}

/**
 * `filterAnnotations` (R8, C16) — an annotation keyed to a `chain_id`, `path`
 * or `candidate_id` the skeleton never supplied is dropped and counted
 * BEFORE `merge.ts` ever sees it; the derived item still renders,
 * skeleton-style, because the merge only ever ADDS prose onto ids it
 * already has. The model may rewrite a task `title`; it may not invent one.
 */
export function filterAnnotations(annotations: TourAnnotations, known: KnownIds): FilterAnnotationsResult {
  const dropped: string[] = [];

  const architecture =
    annotations.architecture === null
      ? null
      : {
          body: annotations.architecture.body,
          dirs: annotations.architecture.dirs.filter((d) => {
            const ok = known.treeDirs.has(d.path);
            if (!ok) dropped.push(d.path);
            return ok;
          }),
        };

  const criticalPaths =
    annotations.critical_paths === null
      ? null
      : annotations.critical_paths.filter((p) => {
          const ok = known.chainIds.has(p.chain_id);
          if (!ok) dropped.push(p.chain_id);
          return ok;
        });

  const howToRun = annotations.how_to_run; // steps are grounded by filterSteps, not here

  const guidedReading =
    annotations.guided_reading === null
      ? null
      : annotations.guided_reading.filter((r) => {
          const ok = known.readingPaths.has(r.path);
          if (!ok) dropped.push(r.path);
          return ok;
        });

  const firstTasks =
    annotations.first_tasks === null
      ? null
      : annotations.first_tasks.filter((t) => {
          const ok = known.candidateIds.has(t.candidate_id);
          if (!ok) dropped.push(t.candidate_id);
          return ok;
        });

  return {
    annotations: {
      architecture,
      critical_paths: criticalPaths,
      how_to_run: howToRun,
      guided_reading: guidedReading,
      first_tasks: firstTasks,
    },
    droppedRefs: dropped.length,
    dropped,
  };
}

/**
 * `applyDifficulty` (R9) — overwrite unconditionally from `derive/difficulty.ts`,
 * ignoring anything else on the merged task. Structurally reinforced by
 * `TourAnnotations` having no `difficulty` field (T1) — this is the belt to
 * that structural belt-and-braces.
 */
export function applyDifficulty(
  sections: readonly OnboardingSection[],
  difficultyByCandidateId: ReadonlyMap<string, { difficulty: TourDifficulty; basis: TourDifficultyBasis }>,
): OnboardingSection[] {
  return sections.map((s): OnboardingSection => {
    if (s.kind !== 'first_tasks' || !s.tasks) return s;
    return {
      ...s,
      tasks: s.tasks.map((t) => {
        const truth = difficultyByCandidateId.get(t.candidate_id);
        return truth ? { ...t, difficulty: truth.difficulty, difficulty_basis: truth.basis } : t;
      }),
    };
  });
}
