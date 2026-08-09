/* hooks/conventions.ts — React Query hooks for the Conventions extractor.

   Mirrors hooks/skills.ts: one query per read endpoint, mutations invalidate the
   repo's list. Write shapes come from @devdigest/shared — never redeclared here. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Convention,
  ConventionStatus,
  CreateSkillFromConventionsInput,
  ExtractConventionsResult,
  Skill,
  UpdateConventionInput,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined, status?: ConventionStatus) {
  return useQuery({
    queryKey: ["conventions", repoId, status ?? null],
    queryFn: () =>
      api.get<Convention[]>(
        status
          ? `/repos/${repoId}/conventions?status=${status}`
          : `/repos/${repoId}/conventions`,
      ),
    enabled: !!repoId,
  });
}

/**
 * Run a scan. Deliberately not optimistic: the response carries the
 * proposed/verified/dropped counts, which are the point of the screen, and there
 * is nothing sensible to show while they are unknown.
 */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ExtractConventionsResult>(`/repos/${repoId}/conventions/extract`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateConventionInput }) =>
      api.patch<Convention>(`/conventions/${id}`, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

/**
 * Promote the accepted candidates into one skill. Invalidates the skills list
 * too — the new skill has to appear in the Lab and in the agent's Skills tab
 * without a reload.
 */
export function useCreateSkillFromConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillFromConventionsInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["skills"] });
      void qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}
