/* hooks/tour.ts — React Query hooks for the onboarding tour
   (specs/12-onboarding-generator.md). A new domain file rather than an append
   to core.ts: the hooks directory is already split by domain, and a tour hook
   in core.ts is the reach that makes core.ts the file everything lands in. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TourRecord } from "@devdigest/shared";
import { api } from "../api";

/** The repo's onboarding tour — `null` is a state ("not yet generated"), same
    reasoning as `usePrIntent`/`useBrief`, not the absence of data. */
export function useTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["tour", repoId],
    queryFn: () => api.get<TourRecord | null>(`/repos/${repoId}/tour`),
    enabled: !!repoId,
  });
}

/** (Re-)generate a repo's onboarding tour. `force:true` bypasses the R12 cache
    key — required on a degraded/skeleton record's Retry, so a matching cache
    key does not just hand back the same failure (mirrors useGenerateBrief). */
export function useGenerateTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force?: boolean) =>
      api.post<TourRecord>(`/repos/${repoId}/tour`, force ? { force } : undefined),
    onSuccess: (data) => qc.setQueryData(["tour", repoId], data),
  });
}
