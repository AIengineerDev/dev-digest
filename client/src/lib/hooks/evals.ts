/* hooks/evals.ts — React Query hooks over the eval pipeline (spec 13).
   Turn a decided finding into an eval case; list an agent's cases. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalCase,
  EvalCasePreview,
  EvalDashboardOverview,
  EvalExpectation,
  EvalCaseWithOwner,
  EvalDryRunResult,
  EvalRunGroup,
  EvalRunResult,
} from "@devdigest/shared";

export interface CreateEvalCaseInput {
  findingId: string;
  name?: string;
  notes?: string | null;
  /** The editor's expected-output JSON; omitted, the server derives it. */
  expected_output?: EvalExpectation[];
  /** Only used to invalidate the agent's case list once the row exists. */
  agentId?: string | null;
}

export interface CreateEvalCaseResponse {
  case: EvalCase;
  /** False when the finding already had a case — the click was a repeat. */
  created: boolean;
}

export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn:
    ({ findingId, name, notes, expected_output }: CreateEvalCaseInput) =>
      api.post<CreateEvalCaseResponse>(`/findings/${findingId}/eval-case`, {
        ...(name ? { name } : {}),
        ...(notes ? { notes } : {}),
        ...(expected_output ? { expected_output } : {}),
      }),
    onSuccess: (_d, { agentId }) => {
      if (agentId) qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    },
  });
}

/**
 * What the case editor shows before the case exists. Not cached across opens:
 * the pinned diff must reflect the review as it stands when the editor opens.
 */
export function useEvalCasePreview(findingId?: string | null) {
  return useQuery({
    queryKey: ["eval-case-preview", findingId],
    enabled: !!findingId,
    staleTime: 0,
    queryFn: () => api.get<EvalCasePreview>(`/findings/${findingId}/eval-case-preview`),
  });
}

export function useAgentEvalCases(agentId?: string | null) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    enabled: !!agentId,
    queryFn: () => api.get<{ cases: EvalCase[] }>(`/agents/${agentId}/eval-cases`),
    select: (d) => d.cases,
  });
}

/** The Eval Dashboard's overview: every agent + the workspace's recent runs. */
export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalDashboardOverview>("/eval-dashboard"),
  });
}

/** An agent's run history, newest first — one entry per run of the whole set. */
export function useAgentEvalRuns(agentId?: string | null) {
  return useQuery({
    queryKey: ["eval-runs", agentId],
    enabled: !!agentId,
    queryFn: () => api.get<EvalRunGroup[]>(`/agents/${agentId}/eval-runs`),
  });
}

/**
 * Run the whole set. Every case is a model call, so this is deliberately not
 * retried and not optimistic: the button stays busy until the server answers,
 * and the history is refetched rather than patched — the run's own rows are the
 * only place its numbers exist.
 */
export function useRunEvals() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (agentId: string) => api.post<EvalRunResult[]>(`/agents/${agentId}/eval-runs`, {}),
    onSuccess: (_d, agentId) => {
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/**
 * Run a DRAFT case against the agent without storing it — the case editor's
 * `Run case`.
 *
 * Not persisted on purpose: the row does not exist until Save, and a run with
 * no `case_id` has nowhere to live. What this answers is narrower and more
 * useful while editing — is the expectation I just wrote one the agent can
 * actually meet?
 */
export function useDryRunEvalCase() {
  return useMutation({
    retry: false,
    mutationFn: ({
      agentId,
      name,
      input_diff,
      expected_output,
    }: {
      agentId: string;
      name: string;
      input_diff: string;
      expected_output: unknown;
    }) =>
      api.post<EvalDryRunResult>(`/agents/${agentId}/eval-runs/preview`, {
        name,
        input_diff,
        expected_output,
      }),
  });
}

/**
 * What a skill can be judged by: its own cases plus the sets of every agent
 * that links it, each tagged with its owner.
 *
 * A skill reviews nothing on its own, so "the skill's cases" would be an almost
 * always empty list. The agents that link it are what its text actually moves.
 */
export function useSkillEvalCases(skillId?: string | null) {
  return useQuery({
    queryKey: ["skill-eval-cases", skillId],
    enabled: !!skillId,
    queryFn: () => api.get<EvalCaseWithOwner[]>(`/skills/${skillId}/eval-cases`),
  });
}

/** Run one saved case. Persists a row, unlike the draft dry-run. */
export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: ({ caseId }: { caseId: string; agentId: string }) =>
      api.post<EvalRunResult>(`/eval-cases/${caseId}/run`, {}),
    onSuccess: (_d, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      caseId,
      ...patch
    }: {
      caseId: string;
      agentId: string;
      name?: string;
      expected_output?: unknown;
      notes?: string | null;
    }) => api.put<EvalCase>(`/eval-cases/${caseId}`, patch),
    onSuccess: (_d, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      // The Skills page reads a DIFFERENT key: `/skills/:id/eval-cases` returns
      // the sets of every agent linking the skill (spec 13, R14). Without this
      // the row it shows is the pre-edit one.
      qc.invalidateQueries({ queryKey: ["skill-eval-cases"] });
    },
  });
}

/** Deleting a case takes its runs with it — the history of a case nobody can
    open again is not history anyone can act on. */
export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId }: { caseId: string; agentId: string }) =>
      api.del<void>(`/eval-cases/${caseId}`),
    onSuccess: (_d, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      // Same key the create path already invalidates. Without it the deleted
      // row stays on the Skills page, and the next click on it asks the server
      // to delete a row that is already gone — which answers, correctly,
      // "eval case not found", so a delete that WORKED reports as a failure.
      qc.invalidateQueries({ queryKey: ["skill-eval-cases"] });
    },
  });
}

/** Create a case by hand — the Case Editor's save. */
export function useCreateManualEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      owner_kind: "agent" | "skill";
      owner_id: string;
      name: string;
      input_diff: string;
      expected_output: unknown;
    }) => api.post<EvalCase>("/eval-cases", input),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", input.owner_id] });
      qc.invalidateQueries({ queryKey: ["skill-eval-cases"] });
    },
  });
}
