/* hooks/ci.ts — React Query hooks over Export to CI (spec 15). Data access for
   the agent editor's CI tab and its export wizard; kept out of the component
   folder per frontend-ui-architecture ("anything that reads or writes API
   data" → `src/lib/hooks/*`). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CiExport,
  CiExportInputBody,
  CiFile,
  CiInstallation,
  CiRun,
  MemoryEntry,
} from "@devdigest/shared";

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

/**
 * Every CI run in the workspace, newest first — the `CI Runs` screen.
 *
 * Polled rather than pushed: these rows are written by a runner reporting back
 * from someone else's CI, so there is no local run to subscribe to and no
 * event to wait for. Thirty seconds is slow enough to be free and fast enough
 * that a run finishing while the screen is open appears without a reload.
 */
export function useCiRuns() {
  return useQuery({
    queryKey: ["ci-runs"],
    queryFn: () => api.get<CiRun[]>("/ci-runs"),
    refetchInterval: 30_000,
  });
}

/**
 * Pull each repository's GitHub Actions history into `ci_runs`.
 *
 * A mutation, not a refetch: it writes rows and spends GitHub API calls, so it
 * happens when someone asks for it. Invalidates the list on success so the new
 * rows appear without a reload.
 */
export function useSyncCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ inserted: number; skipped: string[] }>("/ci-runs/sync", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ci-runs"] }),
  });
}

/** Everything this workspace has learned — the Memory screen. */
export function useMemory() {
  return useQuery({
    queryKey: ["memory"],
    queryFn: () => api.get<MemoryEntry[]>("/memory"),
  });
}
