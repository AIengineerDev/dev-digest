/* hooks/reviews.ts — React Query + SSE hooks for the A2 reviewer.
   Run a review, stream RunEvents live, act on findings. */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "../api";
import { notify } from "../toast";
import type {
  BriefRecord,
  FindingActionKind,
  MultiAgentRunView,
  PrIntentRecord,
  PrReviewComment,
  ReviewRecord,
  ReviewRunResponse,
  RunEvent,
  RunSummary,
} from "@devdigest/shared";

// ---- Active (in-flight) runs — server-side source of truth ----
export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}

/** In-flight runs for a PR, from the server (agent_runs where status='running').
   Survives reloads/devices; polls while anything is running so it self-clears. */
export function usePrActiveRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-active-runs", prId],
    queryFn: () => api.get<ActiveRun[]>(`/pulls/${prId}/runs/active`),
    enabled: !!prId,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 4000 : false),
  });
}

// ---- Full run history for a PR (every agent_runs row, any status) ----
/** All runs for a PR — done, failed (with error), cancelled, running. Survives
   reload (DB-backed). Polls while anything is running so it self-updates. */
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-runs", prId],
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? 4000 : false,
  });
}

// ---- A multi-agent run's results: member runs + server-grouped findings ----
/** Backs the results screen (R5/R6). Polls while any member is still running,
   mirroring `usePrRuns` above. */
export function useMultiAgentRun(prId: string | null | undefined, id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", prId, id],
    queryFn: () => api.get<MultiAgentRunView>(`/pulls/${prId}/multi-agent-runs/${id}`),
    enabled: !!prId && !!id,
    refetchInterval: (query) =>
      (query.state.data?.runs ?? []).some((r) => r.status === "running") ? 4000 : false,
  });
}

export interface LatestMultiAgentRun {
  id: string;
  prId: string;
  prNumber: number;
}

/** The repo's most recent multi-agent run, or null — R8's landing screen
   resolves this to know what to open on before rendering a form. */
export function useLatestMultiAgentRun(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["latest-multi-agent-run", repoId],
    queryFn: () => api.get<LatestMultiAgentRun | null>(`/repos/${repoId}/multi-agent-runs/latest`),
    enabled: !!repoId,
  });
}

export interface AgentEstimate {
  agent_id: string;
  median_duration_ms: number | null;
  median_cost_usd: number | null;
}

/** Per-agent median duration/cost over recent runs (R9). An agent absent from
   the result has no run history — the caller renders `no estimate yet`, never
   `~0s · $0.00` (a zero and an absence are different claims). */
export function useAgentEstimates() {
  return useQuery({
    queryKey: ["agent-estimates"],
    queryFn: () => api.get<AgentEstimate[]>("/agents/estimates"),
  });
}

// ---- Persisted reviews + findings for a PR ----
export function usePrReviews(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["reviews", prId],
    queryFn: () => api.get<ReviewRecord[]>(`/pulls/${prId}/reviews`),
    enabled: !!prId,
  });
}

/** Delete one run from the PR's run history (+ its trace). */
export function useDeleteRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.del<{ ok: boolean }>(`/runs/${runId}`),
    // Deleting a run also deletes the review it produced (server-side), so drop
    // both the timeline and the Review Runs list from cache.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
    },
  });
}

/** Request cancellation of an in-flight run (takes effect at the next step). */
export function useCancelRun() {
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
  });
}

/** Delete a whole review run (one agent's pass) + its findings. */
export function useDeleteReview(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.del<{ ok: boolean }>(`/reviews/${reviewId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews", prId] }),
  });
}

// ---- Inline review comments on the "Files changed" tab (proxied to GitHub) --
/** Existing GitHub PR review comments, fetched live. */
export function usePrComments(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-comments", prId],
    queryFn: () => api.get<PrReviewComment[]>(`/pulls/${prId}/comments`),
    enabled: !!prId,
  });
}

export interface CreateCommentInput {
  path: string;
  line: number;
  side?: "LEFT" | "RIGHT";
  body: string;
  in_reply_to?: number;
}

/** Post one inline comment (or reply) to GitHub; refreshes the thread list. */
export function useCreatePrComment(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      api.post<PrReviewComment>(`/pulls/${prId}/comments`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-comments", prId] }),
  });
}

// ---- Run a review (all enabled agents, a specific agent, or a subset) ----
export interface RunReviewInput {
  prId: string;
  agentId?: string;
  all?: boolean;
  /** Multi-agent subset (C1). Takes precedence over `agentId`/`all` server-side. */
  agentIds?: string[];
}

export function useRunReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentId, all, agentIds }: RunReviewInput) =>
      api.post<ReviewRunResponse>(`/pulls/${prId}/review`, {
        ...(agentId ? { agentId } : {}),
        ...(all ? { all } : {}),
        ...(agentIds?.length ? { agentIds } : {}),
      }),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
    },
  });
}

// ---- Finding actions (accept/dismiss) ----
export function useFindingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      action,
      reply,
      prId: _prId,
    }: {
      findingId: string;
      action: FindingActionKind;
      reply?: string;
      prId?: string;
    }) =>
      api.post<{ finding: ReviewRecord["findings"][number]; memoryId?: string }>(
        `/findings/${findingId}/${action}`,
        reply ? { reply } : undefined,
      ),
    onSuccess: (_d, { prId }) => {
      if (prId) qc.invalidateQueries({ queryKey: ["reviews", prId] });
    },
  });
}

/**
 * Subscribe to a run's SSE event stream. Returns the accumulated RunEvents and a
 * `running` flag (true until the stream closes). Live status for the
 * RunReviewDropdown / Live Log. Multiple runIds are subscribed in parallel.
 */
export function useRunEvents(runIds: string[]) {
  const [events, setEvents] = React.useState<RunEvent[]>([]);
  const [running, setRunning] = React.useState(false);
  const key = runIds.join(",");

  React.useEffect(() => {
    if (runIds.length === 0) return;
    setEvents([]);
    setRunning(true);
    const sources: EventSource[] = [];
    let open = runIds.length;

    for (const runId of runIds) {
      const es = new EventSource(`${API_BASE}/runs/${runId}/events`);
      const onMsg = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data) as RunEvent;
          setEvents((prev) => [...prev, parsed]);
          // Runtime agent failures arrive as SSE `error` events (not as a
          // mutation/query error), so the global error toast never sees them —
          // surface them here so the user gets a notification without a reload.
          if (parsed.kind === "error" && parsed.msg) notify.error(parsed.msg);
        } catch {
          /* ignore non-JSON keepalive frames (and dataless native error events) */
        }
      };
      // The server tags events with kind as the SSE `event:` name AND emits them
      // as default messages too in some clients — listen broadly.
      es.onmessage = onMsg;
      for (const kind of ["info", "tool", "result", "error"]) {
        es.addEventListener(kind, onMsg as EventListener);
      }
      es.onerror = () => {
        es.close();
        open -= 1;
        if (open <= 0) setRunning(false);
      };
      sources.push(es);
    }

    return () => {
      for (const es of sources) es.close();
      setRunning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { events, running };
}

// ---- Derived intent (specs/04-intent-layer.md) ----
/** The PR's derived intent — `null` is a state ("not yet derived"), not absence
   of data, so it renders like any other successful, empty query result. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentRecord | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** (Re-)derive a PR's intent. `force:true` bypasses the fingerprint cache. */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force?: boolean) =>
      api.post<PrIntentRecord | null>(`/pulls/${prId}/intent`, force ? { force } : undefined),
    onSuccess: (data) => qc.setQueryData(["pr-intent", prId], data),
  });
}

// ---- PR Brief (specs/10-pr-brief.md) ----
/** The PR's brief — `null` is a state ("not yet generated"), not absence of
   data, so it renders like any other successful, empty query result. */
export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: () => api.get<BriefRecord | null>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** (Re-)generate a PR's brief. `force:true` bypasses the R6 cache — required
   on a degraded record's Retry (spec amendment A-2): a matching cache key
   returns the cached row, including a degraded one, so without `force` Retry
   would just hand back the same failure. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force?: boolean) =>
      api.post<BriefRecord>(`/pulls/${prId}/brief`, force ? { force } : undefined),
    onSuccess: (data) => qc.setQueryData(["pr-brief", prId], data),
  });
}
