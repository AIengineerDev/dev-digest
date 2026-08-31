import { z } from 'zod';

/**
 * Run trace. The ENTIRE trace of one run is persisted as a SINGLE
 * jsonb document in `run_traces` (not per-row). Live events stream via SSE
 * during the run; the full log is written once on completion.
 */

export const RunEventKind = z.enum(['info', 'tool', 'result', 'error']);
export type RunEventKind = z.infer<typeof RunEventKind>;

/** A single live-log line. `t` = elapsed timestamp string (e.g. "00.31"). */
export const RunLogLine = z.object({
  t: z.string(),
  kind: RunEventKind,
  msg: z.string(),
});
export type RunLogLine = z.infer<typeof RunLogLine>;

/** SSE payload streamed on `/runs/:id/events`. */
export const RunEvent = z.object({
  runId: z.string(),
  seq: z.number().int(),
  kind: RunEventKind,
  msg: z.string(),
  t: z.string(),
  data: z.unknown().optional(),
});
export type RunEvent = z.infer<typeof RunEvent>;

export const ToolCall = z.object({
  tool: z.string(),
  args: z.string(),
  meta: z.string().nullish(),
  ms: z.number().int(),
});
export type ToolCall = z.infer<typeof ToolCall>;

/** One document's attribution row inside `PromptAssembly.specs_used`
 *  (specs/09-project-context.md R5, R6, R8, R10). */
export const SpecUsed = z.object({
  path: z.string(),
  /** `agent` and/or `skill:<name>` — both listed when a document is attached
   *  through both routes and deduped into one injection (R6). */
  sources: z.array(z.string()),
  tokens: z.number().int(),
  status: z.enum(['injected', 'dropped', 'skipped']),
});
export type SpecUsed = z.infer<typeof SpecUsed>;

export const PromptAssembly = z.object({
  system: z.string(),
  skills: z.string().nullish(),
  memory: z.string().nullish(),
  specs: z.string().nullish(),
  /** Callers-of-changed-symbols digest (repo-intel); null when absent. */
  callers: z.string().nullish(),
  /** Repo skeleton / map (repo-intel); null when absent. Enables per-slot token
      attribution in the run trace. */
  repo_map: z.string().nullish(),
  /** PR author's description/body (truncated); null when absent. */
  pr_description: z.string().nullish(),
  /** Derived-intent block (rendered, exactly as sent); null when omitted. */
  intent: z.string().nullish(),
  /**
   * `name@version` of every skill whose body is inside `skills`, in prompt
   * order. The `skills` slot is one concatenated string, so without this the
   * only way to answer "which skills did this run actually use?" is to scroll
   * the whole block and recognise each body — the question that motivated the
   * field. Null on traces written before it existed, and on runs with no skills.
   */
  skills_used: z.array(z.string()).nullish(),
  /**
   * Token count of the `skills` slot alone, from the same tokenizer the run
   * log's per-section stats use (`prompt-log.ts:describePromptSections`).
   * Null when the run has no skills slot, or on traces written before this
   * field existed — never 0, so the Run Trace UI can tell "no skills" from
   * "skills present, count unknown".
   */
  skills_tokens: z.number().int().nullish(),
  /**
   * Ties this assembly to its `prompt assembled` log lines. The run log carries
   * only metadata (section, source, size, model), so this id is what lets an
   * operator go from a size anomaly in the log to the actual assembly stored
   * here. Null on traces written before the id existed.
   */
  correlation_id: z.string().nullish(),
  /**
   * Per-document attribution for the `specs` slot (specs/09-project-context.md
   * R5, R6). Metadata only — path, attachment source(s), token count, status —
   * never the document text: `specs` already holds the rendered block verbatim
   * and `user` holds the whole message, so a third copy would double the
   * largest thing in the trace (root `INSIGHTS.md:211-219`). Null on traces
   * written before this field existed, and on runs with no `specs` slot.
   */
  specs_used: z.array(SpecUsed).nullish(),
  /**
   * Token count of the `specs` slot alone, from the same tokenizer the run
   * log's per-section stats use. Null when the run has no `specs` slot, or on
   * traces written before this field existed — never 0.
   */
  specs_tokens: z.number().int().nullish(),
  user: z.string(),
});
export type PromptAssembly = z.infer<typeof PromptAssembly>;

export const MemoryPulled = z.object({
  pr: z.number().int().nullish(),
  text: z.string(),
});
export type MemoryPulled = z.infer<typeof MemoryPulled>;

export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  /**
   * USD billed for this run. Null — never 0 — when the price is unknown (model
   * missing from the price book) or the run never reached the model. The UI
   * renders null as "—"; a 0 would read as "this review was free".
   */
  cost_usd: z.number().nullable(),
  findings: z.number().int(),
  grounding: z.string(),
});
export type RunStats = z.infer<typeof RunStats>;

/** The single-document trace stored in `run_traces.trace`. */
export const RunTrace = z.object({
  config: z.object({
    agent: z.string(),
    version: z.string().nullish(),
    provider: z.string().nullish(),
    model: z.string(),
    pr: z.number().int().nullish(),
    source: z.enum(['local', 'ci']).default('local'),
  }),
  stats: RunStats,
  prompt_assembly: PromptAssembly,
  tool_calls: z.array(ToolCall),
  raw_output: z.string(),
  memory_pulled: z.array(MemoryPulled),
  specs_read: z.array(z.string()),
  log: z.array(RunLogLine),
});
export type RunTrace = z.infer<typeof RunTrace>;

/**
 * One row of a PR's run history (every agent_runs row, any status). Surfaced on
 * the PR page so runs — including FAILED ones with their error — survive reload.
 */
export const RunSummary = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.string().nullable(), // running | done | failed | cancelled
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  /** USD billed for this run; null when unpriced or unfinished. See RunStats. */
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
  grounding: z.string().nullable(),
  ran_at: z.string().nullable(),
  // Review outcome, denormalized onto the run row at completion (the timeline
  // has no FK to the review). score = the review's 0-100 score; blockers =
  // findings that trip the agent's gate. Null on failed/cancelled runs.
  score: z.number().int().nullable(),
  blockers: z.number().int().nullable(),
  /**
   * PR head this run reviewed, stamped when it started. Compare with the PR's
   * current `head_sha` to tell a live run from one whose findings describe code
   * that has since changed or been deleted. Null on runs that predate the
   * column.
   */
  head_sha: z.string().nullable(),
  /** Shared id when this run was part of a multi-agent fan-out; null on a
   *  single-agent run and on rows written before this feature (never backfilled). */
  multi_agent_run_id: z.string().nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;
