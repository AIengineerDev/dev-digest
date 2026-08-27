import type { RepoIntelState } from "@/lib/hooks";
import type { OnboardingSection, OnboardingSectionKind, TourDifficulty, TourRecord } from "@devdigest/shared";

/**
 * With no `repo_index_state` row, `RepoIntelService.getIndexState` synthesizes
 * a `degraded` state with `reason: 'no_data'` and an empty `lastIndexedSha`
 * rather than throwing (`server/src/modules/repo-intel/service.ts:192-204`) —
 * so "never indexed" is not distinguishable from a real `failed` status by
 * `status` alone; it is `degraded` + an empty `lastIndexedSha` (R18, C1).
 */
export function isNotIndexed(state: RepoIntelState | undefined | null): boolean {
  if (!state) return true;
  if (state.status === "failed") return true;
  return state.status === "degraded" && !state.lastIndexedSha;
}

/** Display form of a sha — 7 chars, the length git itself abbreviates to. */
export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "";
}

const DIFFICULTY_RANK: Record<TourDifficulty, number> = { low: 0, medium: 1, high: 2 };

/**
 * First tasks, ascending difficulty (design proposal, spec `:301-303`): the
 * section exists so a reader can choose by confidence, and confidence reads
 * top-left first. The mock's own grid order is arbitrary; the server does
 * not order `tasks[]` by difficulty, so this is a render-time sort, not a
 * trust in array order. Stable — equal difficulties keep the server's order.
 */
export function sortTasksByDifficulty<T extends { difficulty: TourDifficulty }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]);
}

/**
 * Look up a section by kind, defensively — the derivation layer always
 * builds all five kinds (R24), but a render must not throw if one is
 * somehow missing (client/INSIGHTS.md: zero error boundaries in this app).
 */
export function sectionFor(tour: Pick<TourRecord, "sections">, kind: OnboardingSectionKind): OnboardingSection {
  return (
    tour.sections.find((sec) => sec.kind === kind) ?? {
      kind,
      title: "",
      body: null,
      diagram: null,
      links: [],
    }
  );
}

/** Whether a section's rail entry should render greyed (B2.7) — no content
 *  (an empty message) or no prose (a skeleton marker). */
export function isRailDim(section: OnboardingSection): boolean {
  return !!section.empty_reason || !!section.skeleton;
}

/** Middle-truncate a long path/command for display, keeping the full value
 *  available via `title` and Copy (C9). */
export function truncateMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
}
