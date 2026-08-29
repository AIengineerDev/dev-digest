import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import { DerivedIntent, SmartDiff } from './brief.js';
import { RunSummary } from './trace.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  /** PR head this review ran against; see `RunSummary.head_sha`. */
  head_sha: z.string().nullable(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
  /** Shared group id when this POST fanned out to more than one agent; null on
   *  a single-agent run — never invented for one. */
  multi_agent_run_id: z.string().nullable(),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/**
 * One agent's take on a grouped finding location. `finding: null` means this
 * agent ran over the location and did not flag it — a claim the server stands
 * behind, not an inference the client draws from an absence.
 */
export const FindingGroupTake = z.object({
  agent_id: z.string(),
  agent_name: z.string().nullable(),
  finding: FindingRecord.nullable(),
});
export type FindingGroupTake = z.infer<typeof FindingGroupTake>;

/**
 * Findings from a multi-agent run, grouped by file + overlapping line range.
 * `takes` covers every agent in the run, including silent ones. `conflict` is
 * true when at least one agent flagged the location and at least one did not.
 */
export const FindingGroup = z.object({
  key: z.string(),
  file: z.string(),
  anchor_start: z.number().int(),
  anchor_end: z.number().int(),
  title: z.string(),
  takes: z.array(FindingGroupTake),
  conflict: z.boolean(),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

/**
 * Served by `GET /pulls/:id/multi-agent-runs/:multiAgentRunId`. No `pr_id`:
 * the route is nested under the PR, so the path already carries it.
 */
export const MultiAgentRunView = z.object({
  runs: z.array(RunSummary),
  groups: z.array(FindingGroup),
});
export type MultiAgentRunView = z.infer<typeof MultiAgentRunView>;

/** Derived intent persisted for a PR (the DerivedIntent plus the pr_id it scopes). */
export const PrIntentRecord = DerivedIntent.extend({ pr_id: z.string() });
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;
