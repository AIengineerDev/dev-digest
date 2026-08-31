import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalCase, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/**
 * One expectation inside a case's `expected_output`.
 *
 * `must_find` came from an accepted finding — the agent should report at this
 * location. `must_not_flag` came from a dismissal — it should not. The kind is
 * derived from the decision, never chosen by the user (spec 13, R1).
 */
export const EvalExpectationKind = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationKind = z.infer<typeof EvalExpectationKind>;

export const EvalExpectation = z.object({
  kind: EvalExpectationKind,
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  /** The source finding's title — for display only; never gates a match. */
  title: z.string().nullish(),
});
export type EvalExpectation = z.infer<typeof EvalExpectation>;

/**
 * What the editor shows BEFORE the case exists: the derived name and
 * expectation, and the input the case would pin. Served by
 * `GET /findings/:id/eval-case-preview` so the diff on screen is the same
 * bytes the case stores — not a second fetch that could disagree with it.
 */
export const EvalCasePreview = z.object({
  finding_id: z.string(),
  /** Present once the finding already produced a case; the editor then edits it. */
  existing_case_id: z.string().nullable(),
  name: z.string(),
  expectation: EvalExpectation,
  input_diff: z.string(),
  input_files: z.array(z.string()),
  pr: z.object({
    number: z.number().int(),
    title: z.string(),
    body: z.string().nullable(),
    head_sha: z.string().nullable(),
  }),
  agent: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
});
export type EvalCasePreview = z.infer<typeof EvalCasePreview>;

/** Body of `POST /findings/:id/eval-case`. Everything else is derived. */
export const EvalCaseFromFindingInput = z.object({
  name: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).nullish(),
  /**
   * The editor's expected-output JSON. Optional: omitting it keeps the
   * expectation derived from the decision, which is the path R1 describes.
   */
  expected_output: z.array(EvalExpectation).min(1).optional(),
});
export type EvalCaseFromFindingInput = z.infer<typeof EvalCaseFromFindingInput>;

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/**
 * One RUN of an agent's whole set: the rows that share a `ran_at`.
 *
 * There is no `run_group_id` column — the shared instant IS the group, written
 * once by the service rather than defaulted per row, so grouping is exact
 * instead of a range query over insert times (spec 13, R3).
 *
 * `system_prompt` is the snapshot the run actually used. Comparing two runs has
 * to show WHY a metric moved, and the agent may have been edited again since.
 */
export const EvalRunGroup = z.object({
  ran_at: z.string(),
  agent_version: z.number().int().nullable(),
  model: z.string().nullable(),
  system_prompt: z.string().nullable(),
  cases_total: z.number().int(),
  /**
   * False while a run is still going. Rows are written per case, so a group
   * read mid-run looks FINISHED with fewer cases — and `2/2 passing` reads
   * better than the truthful `2/3`. This says which you are looking at.
   */
  complete: z.boolean(),
  passed: z.number().int(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  cost_usd: z.number().nullable(),
  runs: z.array(EvalRunRecord),
});
export type EvalRunGroup = z.infer<typeof EvalRunGroup>;

/**
 * A case as the SKILL editor sees it: the case plus who owns it.
 *
 * A skill does not review anything on its own, so it has no cases of its own to
 * speak of — what it can be judged by is the sets of the agents that link it.
 * `owner_name` is what lets the tab say "via Security Reviewer" instead of
 * showing a bare uuid, and it is why this is not just `EvalCase[]`.
 */
export const EvalCaseWithOwner = EvalCase.extend({
  owner_name: z.string().nullable(),
});
export type EvalCaseWithOwner = z.infer<typeof EvalCaseWithOwner>;

/** Body of `PUT /eval-cases/:id`. Every field optional — a rename is a rename. */
export const EvalCasePatch = z.object({
  name: z.string().min(1).max(200).optional(),
  expected_output: z.unknown().optional(),
  notes: z.string().nullish(),
});
export type EvalCasePatch = z.infer<typeof EvalCasePatch>;

/** Body of `POST /agents/:id/eval-runs/preview` — a draft case, run but not stored. */
export const EvalDryRunInput = z.object({
  name: z.string().min(1).max(200).default('draft case'),
  input_diff: z.string().default(''),
  expected_output: z.unknown(),
});
export type EvalDryRunInput = z.infer<typeof EvalDryRunInput>;

/** What the case editor shows in its `Actual output` panel after a dry run. */
export const EvalDryRunResult = z.object({
  result: EvalRun,
  findings: z.array(z.unknown()),
  error: z.string().nullable(),
});
export type EvalDryRunResult = z.infer<typeof EvalDryRunResult>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

/**
 * The Eval Dashboard's list row: one agent, with the metrics of its latest run.
 *
 * Every metric is nullable and `last_run_at: null` means never evaluated — a
 * zero and an absence are different claims, and R8 requires the screen to say
 * which one it is showing.
 */
export const EvalAgentSummary = z.object({
  agent_id: z.string(),
  agent_name: z.string().nullable(),
  cases_total: z.number().int(),
  last_run_at: z.string().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  passed: z.number().int().nullable(),
  total: z.number().int().nullable(),
});
export type EvalAgentSummary = z.infer<typeof EvalAgentSummary>;

/** `GET /eval-dashboard` — every agent plus the workspace's recent runs. */
export const EvalDashboardOverview = z.object({
  agents: z.array(EvalAgentSummary),
  recent_runs: z.array(EvalRunRecord),
});
export type EvalDashboardOverview = z.infer<typeof EvalDashboardOverview>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
  /** `owner/name` of the repository an ingested Actions run belongs to. */
  repo: z.string().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;

// ===========================================================================
// Memory — the RAG store (`memory`)
// ===========================================================================

/**
 * One thing DevDigest has learned about a workspace's code.
 *
 * The embedding is deliberately absent: 1536 floats per row that no reader can
 * use, and similarity search belongs in Postgres, not in a browser.
 */
export const MemoryEntry = z.object({
  id: z.string(),
  /** `repo` · `global` · `team` */
  scope: z.string(),
  /** `decision` · `convention` · `preference` · `fact` · `learning` */
  kind: z.string(),
  content: z.string(),
  confidence: z.number().nullable(),
  created_at: z.string(),
  /** When this last informed a review — null if it never has. */
  last_used_at: z.string().nullable(),
  /** `owner/name` for a repo-scoped memory; null for a global or team one. */
  repo: z.string().nullable(),
});
export type MemoryEntry = z.infer<typeof MemoryEntry>;
