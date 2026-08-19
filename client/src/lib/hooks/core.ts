/* hooks/core.ts — typed React Query hooks over the F1 API (contracts):
   settings, secrets, repos, pulls, and project context. Scaffolding screens use
   these; feature-domain hooks live in the sibling files (agents/reviews/trace/…)
   and are re-exported alongside these from hooks/index.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Settings,
  SettingsUpdate,
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  Repo,
  PrMeta,
  PrDetail,
  ProjectContextList,
  ProjectContextDocDetail,
  ProjectContextAttachment,
  SmartDiff,
  BlastRadius,
} from "../types";

// ---- Settings (F1: GET/PUT /settings, POST /settings/test-connection) ----
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdate) => api.put<Settings>("/settings", patch),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnTestProvider | { provider: ConnTestProvider; key?: string }) => {
      const body = typeof input === "string" ? { provider: input } : input;
      return api.post<ConnTestResult>("/settings/test-connection", body);
    },
    // Saving/validating a provider key can change which models resolve — drop the
    // cached (possibly empty) model lists so the agent picker refetches, and
    // refresh the "Configured / Not set" key-status badges.
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["provider-models"] });
        qc.invalidateQueries({ queryKey: ["secrets-status"] });
      }
    },
  });
}

/** Which provider keys are configured (booleans only — never the values). */
export function useSecretsStatus() {
  return useQuery({
    queryKey: ["secrets-status"],
    queryFn: () => api.get<SecretsStatus>("/settings/secrets-status"),
    staleTime: 30_000,
  });
}

// ---- Repos (F1: GET/POST /repos, refresh, delete) ----
export function useRepos() {
  return useQuery({
    queryKey: ["repos"],
    queryFn: () => api.get<Repo[]>("/repos"),
  });
}

export function useAddRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.post<Repo>("/repos", { url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }),
  });
}

export function useRefreshRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<Repo>(`/repos/${repoId}/refresh`),
    onSuccess: (_d, repoId) => {
      qc.invalidateQueries({ queryKey: ["repos"] });
      qc.invalidateQueries({ queryKey: ["pulls", repoId] });
    },
  });
}

export function useDeleteRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.del<{ deleted: string }>(`/repos/${repoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }),
  });
}

// ---- Pull requests (F1: GET /repos/:id/pulls, GET /pulls/:id) ----
export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["pulls", repoId],
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    // Auto-refresh PR statuses: re-sync from GitHub every 60s while the page is
    // open, and whenever the window regains focus.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function usePullDetail(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["pull", prId],
    queryFn: () => api.get<PrDetail>(`/pulls/${prId}`),
    enabled: prId != null,
  });
}

/**
 * Smart Diff — the PR's files grouped by role, with the latest review's
 * finding lines already attached.
 *
 * Deliberately NOT invalidated on a schedule: the server computes it from the
 * imported files and the stored findings, so it changes only when a review
 * finishes. `FindingsTab`'s `onRunDone` is what refetches it.
 */
export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}

/**
 * Blast radius — which symbols a PR changes, who calls them, what sits
 * downstream. Served from the persistent code index, so it costs no model call
 * and, like Smart Diff, is never polled: it changes when the PR's files change
 * or the repo is re-indexed, not on a timer.
 */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

// ---- Project Context (specs/09-project-context.md) ----

/** GET /repos/:id/context — the document list, with server-computed token
 *  counts and the commit the scan read the clone at. The client never sums
 *  tokens itself: `total_tokens` and every per-document `tokens` come from
 *  here. */
export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<ProjectContextList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** GET /repos/:id/context/doc?path=… — one document's rendered content, its
 *  attachments, and its GitHub link. */
export function useProjectContextDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-doc", repoId, path],
    queryFn: () => api.get<ProjectContextDocDetail>(`/repos/${repoId}/context/doc?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}

/** PUT /repos/:id/context/attachments — replace one document's whole
 *  attachment set in one write (C9: last write wins, no merge dialog). */
export function useSetContextAttachments(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; targets: Array<{ target_kind: "agent" | "skill"; target_id: string }> }) =>
      api.put<{ attachments: ProjectContextAttachment[] }>(`/repos/${repoId}/context/attachments`, input),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["context", repoId] });
      qc.invalidateQueries({ queryKey: ["context-doc", repoId, vars.path] });
    },
  });
}

/**
 * Rescan (R9) — reuses the existing `POST /repos/:id/resync` (repo-intel's
 * route, which fetches origin then reindexes). There is no separate
 * `/context/reindex` route and there never will be (plan B2 placement
 * decision): discovery is stateless and re-reads the clone on every list
 * request, so a resync followed by a refetch of the list IS the rescan.
 */
export function useReindexContext(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ status: string }>(`/repos/${repoId}/resync`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["context", repoId] }),
  });
}
