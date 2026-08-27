/**
 * `merge.ts` (R24, C14, C16, C17) — pure. `skeleton × TourAnnotations →
 * OnboardingSection[]`. The success path IS `skeleton + annotations merged
 * by id` — there is no other render path (spec Trap 2).
 *
 * Per section: a key that is `null`, absent, or (post-`filterAnnotations`)
 * keyed to nothing at all leaves that section's derived facts intact, marks
 * `skeleton: true` and adds its `kind` to the record's `skeleton_sections`.
 *
 * `guided_reading` takes ONLY the `why`, matched by `path` — the order is
 * ALWAYS the skeleton's (rank-descending); any order the response implies is
 * discarded (A24). `critical_paths` and `first_tasks` are matched by id the
 * same way and ALSO keep the skeleton's own array order.
 *
 * `how_to_run` is the one section where the order is the MODEL's
 * (cross-model review C-1): the merge keeps the response's step sequence and
 * selection wholesale — `filterSteps` (`grounding.ts`, A4.1) filters it to
 * whitelist membership afterwards. The fixed `install → cp → compose → dev`
 * order is the SKELETON's only, i.e. what renders when `how_to_run` is
 * `null` or absent.
 */
import type { OnboardingSection, OnboardingSectionKind } from '@devdigest/shared';
import type { TourAnnotations } from './schemas.js';

export interface MergeResult {
  sections: OnboardingSection[];
  skeletonSections: OnboardingSectionKind[];
}

export function mergeAnnotations(skeleton: readonly OnboardingSection[], annotations: TourAnnotations): MergeResult {
  const skeletonSections: OnboardingSectionKind[] = [];

  const sections = skeleton.map((section): OnboardingSection => {
    switch (section.kind) {
      case 'architecture_overview': {
        if (annotations.architecture === null) {
          skeletonSections.push(section.kind);
          return section;
        }
        const notesByPath = new Map(annotations.architecture.dirs.map((d) => [d.path, d.note]));
        return {
          ...section,
          body: annotations.architecture.body,
          skeleton: false,
          tree: section.tree?.map((entry) => ({
            ...entry,
            note: notesByPath.get(entry.path) ?? null,
          })),
        };
      }

      case 'critical_paths': {
        if (annotations.critical_paths === null) {
          skeletonSections.push(section.kind);
          return section;
        }
        const whyById = new Map(annotations.critical_paths.map((p) => [p.chain_id, p.why]));
        return {
          ...section,
          skeleton: false,
          paths: section.paths?.map((p) => ({ ...p, why: whyById.get(p.chain_id) ?? null })),
        };
      }

      case 'how_to_run': {
        if (annotations.how_to_run === null) {
          skeletonSections.push(section.kind);
          return section;
        }
        return {
          ...section,
          body: annotations.how_to_run.body,
          skeleton: false,
          // C-1: the MODEL's order and selection, wholesale — `filterSteps`
          // narrows this to whitelist membership afterwards.
          run_steps: annotations.how_to_run.steps.map((s) => ({ command: s.command, why: s.why })),
        };
      }

      case 'guided_reading': {
        if (annotations.guided_reading === null) {
          skeletonSections.push(section.kind);
          return section;
        }
        const whyByPath = new Map(annotations.guided_reading.map((r) => [r.path, r.why]));
        return {
          ...section,
          skeleton: false,
          // Order is the SKELETON's (rank-descending) — never re-sorted.
          reading: section.reading?.map((r) => ({ ...r, why: whyByPath.get(r.path) ?? null })),
        };
      }

      case 'first_tasks': {
        if (annotations.first_tasks === null) {
          skeletonSections.push(section.kind);
          return section;
        }
        const byId = new Map(annotations.first_tasks.map((t) => [t.candidate_id, t]));
        return {
          ...section,
          skeleton: false,
          // Order is the SKELETON's (ascending difficulty) — never re-sorted.
          tasks: section.tasks?.map((t) => {
            const annotation = byId.get(t.candidate_id);
            return annotation ? { ...t, title: annotation.title, why: annotation.why } : t;
          }),
        };
      }
    }
  });

  return { sections, skeletonSections };
}
