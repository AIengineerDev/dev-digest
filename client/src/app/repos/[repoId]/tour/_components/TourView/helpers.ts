import type { RepoIntelState } from "@/lib/hooks";

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
