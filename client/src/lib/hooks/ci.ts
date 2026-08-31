/* hooks/ci.ts — React Query hooks over Export to CI (spec 15). Data access for
   the agent editor's CI tab and its export wizard; kept out of the component
   folder per frontend-ui-architecture ("anything that reads or writes API
   data" → `src/lib/hooks/*`). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CiExport, CiExportInputBody, CiFile, CiInstallation } from "@devdigest/shared";

/** This agent's `ci_installations` rows — the CI tab's list (R1). */
export function useCiInstallations(agentId?: string | null) {
  return useQuery({
    queryKey: ["ci-installations", agentId],
    enabled: !!agentId,
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci-installations`),
  });
}

/**
 * `action: 'files'` — the wizard's Preview step. Not cached: a stale preview
 * that no longer matches the agent's current config is worse than refetching,
 * and the wizard only ever calls this once per open (R3 — generate once, hold
 * the result in state, never regenerate to "refresh" a rendered preview).
 */
export function useGenerateCiFiles() {
  return useMutation({
    retry: false,
    mutationFn: ({ agentId, input }: { agentId: string; input: CiExportInputBody }) =>
      api
        .post<{ files: CiFile[] }>(`/agents/${agentId}/export-ci`, { ...input, action: "files" })
        .then((d) => d.files),
  });
}

/**
 * `action: 'open_pr'` — Install. Regenerates server-side from the same
 * deterministic path as Preview (R3); the client never sends `files` back —
 * `CiExportInputBody` has no such field, so this is enforced by the contract,
 * not by discipline.
 */
export function useInstallCi() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: ({ agentId, input }: { agentId: string; input: CiExportInputBody }) =>
      api.post<CiExport>(`/agents/${agentId}/export-ci`, { ...input, action: "open_pr" }),
    onSuccess: (_d, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["ci-installations", agentId] });
    },
  });
}
