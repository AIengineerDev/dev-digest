import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Derived intent (specs/04-intent-layer.md) ----
export const IntentCategory = z.enum([
  'feature',
  'bugfix',
  'refactor',
  'performance',
  'security',
  'docs',
  'test',
  'chore',
  'revert',
  'unknown',
]);
export type IntentCategory = z.infer<typeof IntentCategory>;

export const IntentConfidenceBand = z.enum(['high', 'medium', 'low']);
export type IntentConfidenceBand = z.infer<typeof IntentConfidenceBand>;

export const IntentSourceKind = z.enum([
  'pr_body',
  'linked_issue',
  'referenced_doc',
  'title',
  'branch',
  'commit_subjects',
  'changed_paths',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string().nullish(),
  grade: z.enum(['documentation', 'indirect']),
  used: z.boolean(),
  note: z.string().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

export const DerivedIntent = Intent.extend({
  category: IntentCategory,
  summary: z.string(),
  confidence: z.number(),
  band: IntentConfidenceBand,
  sources: z.array(IntentSource),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  prompt_version: z.number().int(),
  fingerprint: z.string(),
  derived_at: z.string().nullable(),
  degraded: z.boolean(),
  error: z.string().nullish(),
});
export type DerivedIntent = z.infer<typeof DerivedIntent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;

// ---- PR Brief (specs/10-pr-brief.md) ----
/** One "read this first" entry the model points a reviewer at. */
export const ReviewFocusItem = z.object({
  kind: z.enum(['file', 'endpoint']),
  ref: z.string(),
  reason: z.string(),
  line: z.number().int().nullish(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

/** The model's structured-output schema for one PR brief generation (R11). */
export const Brief = z.object({
  what: z.string(),
  why: z.string(),
  risk_level: RiskSeverity,
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
});
export type Brief = z.infer<typeof Brief>;

/**
 * The wire and storage shape: `Brief` plus the R6 cache-state key and the R10
 * trace fields. `intent_fingerprint`/`repo_indexed_sha` are nullable — a PR
 * with no derived intent, or a repo never indexed, is a routine state, not an
 * absent one, and neither is stored as `''` (see `server/INSIGHTS.md`, the
 * `pr_brief_records` primary-key correction). `cost_usd`, `error` and
 * `generated_at` are also nullable so a degraded record (`degraded: true`,
 * `cost_usd: null`, `generated_at: null`, `error` non-null) parses like any
 * other row.
 */
export const BriefRecord = Brief.extend({
  pr_id: z.string(),
  head_sha: z.string(),
  intent_fingerprint: z.string().nullable(),
  repo_indexed_sha: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  prompt_version: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  budget_tokens: z.number().int(),
  dropped_inputs: z.array(z.string()),
  dropped_refs: z.number().int(),
  degraded: z.boolean(),
  error: z.string().nullable(),
  generated_at: z.string().nullable(),
});
export type BriefRecord = z.infer<typeof BriefRecord>;
