import { z } from 'zod';
import { Provider } from './knowledge.js';

/**
 * Platform / scaffolding DTOs owned by F1:
 *  - settings (GET/PUT /settings, POST /settings/test-connection)
 *  - repos (POST/GET /repos, refresh, delete)
 *  - pulls (GET /repos/:id/pulls, GET /pulls/:id)
 *  - context (Project Context folder)
 */

// ---- Feature → model selection ----
/** System LLM features whose model is selectable in Settings (per-workspace). */
export const FeatureModelId = z.enum([
  'onboarding',
  'review_intent',
  'risk_brief',
  'conformance',
  'conventions',
]);
export type FeatureModelId = z.infer<typeof FeatureModelId>;

/** A chosen provider + model for one feature. */
export const FeatureModelChoice = z.object({
  provider: Provider,
  model: z.string().min(1),
});
export type FeatureModelChoice = z.infer<typeof FeatureModelChoice>;

/**
 * Registry of the selectable features: stable id, display label, and the
 * built-in default used when the workspace hasn't overridden the choice. The
 * defaults MIRROR each module's constants, so behaviour is unchanged until a
 * model is explicitly picked.
 */
export interface FeatureModelDef {
  id: FeatureModelId;
  label: string;
  description: string;
  defaultProvider: Provider;
  defaultModel: string;
}
export const FEATURE_MODELS: FeatureModelDef[] = [
  {
    id: 'onboarding',
    label: 'Onboarding Tour',
    description: 'Writes the per-repo onboarding tour.',
    // Repointed 2026-08-26 (CTO): was `openrouter`/`deepseek/deepseek-v4-flash`,
    // the only registry entry never revisited during the pricing work. We do
    // not use OpenRouter, so the default resolved to a provider with no key and
    // every out-of-the-box generation would have degraded to a skeleton. Now
    // matches `review_intent` and `risk_brief`, the two sibling features that
    // also derive facts first and narrate second. Resolves `specs/12-onboarding-generator.md` Q4.
    defaultProvider: 'anthropic',
    defaultModel: 'claude-haiku-4-5',
  },
  {
    id: 'review_intent',
    label: 'PR Review · Intent',
    description: 'Derives a PR’s intent and scope before review.',
    // Cheap pre-pass by design (specs/04-intent-layer.md §7) — $1/$5 per 1M,
    // 200K context. `openai/gpt-4.1` predated the pricing work.
    defaultProvider: 'anthropic',
    defaultModel: 'claude-haiku-4-5',
  },
  {
    id: 'risk_brief',
    label: 'Risk Brief',
    description: 'Assesses merge risks for a pull request.',
    // Cheap pre-pass by design (specs/10-pr-brief.md Q7) — the previous
    // default predated the pricing work, same reasoning as `review_intent`.
    defaultProvider: 'anthropic',
    defaultModel: 'claude-haiku-4-5',
  },
  {
    id: 'conformance',
    label: 'Conformance',
    description: 'Checks a PR against the project spec.',
    defaultProvider: 'openai',
    defaultModel: 'gpt-4.1',
  },
  {
    id: 'conventions',
    label: 'Conventions',
    description: 'Extracts coding conventions from the repo.',
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.4',
  },
];

// ---- Settings ----
/**
 * Non-secret prefs/config. Secrets (API keys) are NOT stored here — they go
 * through SecretsProvider (.env in MVP). Settings is a flat key/value bag,
 * surfaced as a typed object for the well-known keys.
 */
export const SettingsKnown = z.object({
  polling_interval_min: z.number().int().min(1).default(5),
  theme: z.enum(['dark', 'light']).default('dark'),
  density: z.enum(['regular', 'compact']).default('regular'),
  sync_to_folder: z.boolean().default(true),
  automatic_reviews: z.boolean().default(false),
  /** Per-feature model overrides (provider+model), keyed by FeatureModelId. */
  feature_models: z.record(FeatureModelId, FeatureModelChoice).default({}),
});
export type SettingsKnown = z.infer<typeof SettingsKnown>;

/** Full settings payload: well-known keys + arbitrary extras. */
export const Settings = SettingsKnown.passthrough();
export type Settings = z.infer<typeof Settings>;

export const SettingsUpdate = Settings.partial();
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;

// ---- Connection test ----
export const ConnTestProvider = z.enum(['openai', 'anthropic', 'openrouter', 'github']);
export type ConnTestProvider = z.infer<typeof ConnTestProvider>;

export const ConnTestRequest = z.object({
  provider: ConnTestProvider,
  /** Optional API key/PAT to persist and then test (BYO key from the UI). */
  key: z.string().min(1).optional(),
});
export type ConnTestRequest = z.infer<typeof ConnTestRequest>;

export const ConnTestResult = z.object({
  provider: ConnTestProvider,
  ok: z.boolean(),
  message: z.string(),
  detail: z.unknown().optional(),
});
export type ConnTestResult = z.infer<typeof ConnTestResult>;

// ---- Secrets status (which provider keys are configured; never the values) ----
/** Boolean per provider: true ⇒ a key/PAT is stored. The value is never exposed. */
export const SecretsStatus = z.object({
  openai: z.boolean(),
  anthropic: z.boolean(),
  openrouter: z.boolean(),
  github: z.boolean(),
});
export type SecretsStatus = z.infer<typeof SecretsStatus>;

// ---- Repos ----
export const RepoInput = z.object({
  url: z.string().url(),
});
export type RepoInput = z.infer<typeof RepoInput>;

export const Repo = z.object({
  id: z.string(),
  workspace_id: z.string(),
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
  default_branch: z.string(),
  clone_path: z.string().nullable(),
  last_polled_at: z.string().nullable(),
  created_by: z.string().nullable(),
});
export type Repo = z.infer<typeof Repo>;

// ---- Pull requests ----
export const PrStatus = z.enum(['needs_review', 'reviewed', 'stale', 'open', 'closed', 'merged']);
export type PrStatus = z.infer<typeof PrStatus>;

export const PrMeta = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  branch: z.string(),
  base: z.string(),
  head_sha: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  files_count: z.number().int(),
  status: PrStatus,
  opened_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  // Latest-review score (list endpoint only; null/absent until reviewed).
  score: z.number().int().nullish(),
  // USD cost of the LATEST COMPLETED run (list endpoint only). Deliberately not
  // a sum across runs. Null until a run completes, or when the model is unpriced.
  cost_usd: z.number().nullish(),
  // Per-severity finding counts of the LATEST review (list endpoint only), for
  // the list's FINDINGS column. Same latest-not-sum rule as `score` above: a
  // re-review replaces the breakdown rather than adding to it. Null until the
  // PR has been reviewed; all-zero once it has been reviewed and came back clean.
  findings: z
    .object({
      CRITICAL: z.number().int(),
      WARNING: z.number().int(),
      SUGGESTION: z.number().int(),
    })
    .nullish(),
});
export type PrMeta = z.infer<typeof PrMeta>;

export const PrFile = z.object({
  path: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  patch: z.string().nullish(),
});
export type PrFile = z.infer<typeof PrFile>;

export const PrCommit = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.string(),
  committed_at: z.string().nullish(),
});
export type PrCommit = z.infer<typeof PrCommit>;

export const IssueMeta = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullish(),
  state: z.string(),
});
export type IssueMeta = z.infer<typeof IssueMeta>;

export const PrDetail = PrMeta.extend({
  body: z.string().nullish(),
  files: z.array(PrFile),
  commits: z.array(PrCommit),
  linked_issue: IssueMeta.nullish(),
});
export type PrDetail = z.infer<typeof PrDetail>;

// ---- PR review (inline) comments ----
/**
 * A GitHub PR review comment anchored to a diff line. Mirrors the fields the
 * "Files changed" tab needs to render threads inline; `line` is the position in
 * the current diff (null when GitHub can no longer anchor it → `is_outdated`).
 */
export const PrReviewComment = z.object({
  id: z.number().int(),
  path: z.string(),
  line: z.number().int().nullable(),
  original_line: z.number().int().nullable(),
  side: z.enum(['LEFT', 'RIGHT']),
  body: z.string(),
  user: z.string(),
  created_at: z.string(),
  html_url: z.string(),
  in_reply_to_id: z.number().int().nullable(),
  /** GitHub couldn't anchor it to the current diff (line == null). */
  is_outdated: z.boolean(),
});
export type PrReviewComment = z.infer<typeof PrReviewComment>;

/** Body for POST /pulls/:id/comments (create one inline comment / reply). */
export const PrCommentInput = z.object({
  path: z.string().min(1),
  line: z.number().int().positive(),
  side: z.enum(['LEFT', 'RIGHT']).optional(),
  body: z.string().min(1),
  /** Reply to an existing review comment thread (its comment id). */
  in_reply_to: z.number().int().optional(),
});
export type PrCommentInput = z.infer<typeof PrCommentInput>;

// ---- Project Context (specs/09-project-context.md) ----

/**
 * One row of the document list (`GET /repos/:id/context`). Never carries
 * `content` — a list response that shipped every document body would send
 * megabytes to render a sidebar; the body is fetched per-document via
 * `ProjectContextDocDetail`.
 */
export const ProjectContextDoc = z.object({
  path: z.string(),
  size: z.number().int(),
  /** Token count from `container.tokenizer.count`. Nullish = not yet counted
   *  (renders a skeleton, never a `0` — see spec C5). */
  tokens: z.number().int().nullish(),
  agent_count: z.number().int(),
  skill_count: z.number().int(),
  /** Attached but no longer found on disk at the last scan (spec R10). */
  missing: z.boolean(),
  /** Over the per-document size ceiling; listed but not attachable (spec C4). */
  too_large: z.boolean(),
});
export type ProjectContextDoc = z.infer<typeof ProjectContextDoc>;

/** Response of `GET /repos/:id/context` (spec R1, R3a, D4, C3, C6). */
export const ProjectContextList = z.object({
  docs: z.array(ProjectContextDoc),
  /** Commit the scan read the clone at (spec D4's footer; per-document
   *  last-modified info was dropped as unbuildable on a depth-1 clone). */
  head_sha: z.string().nullish(),
  /** True when discovery hit the document cap and stopped (spec C3). */
  truncated: z.boolean(),
  /** The cap `truncated` is measured against. */
  limit: z.number().int(),
  /** Sum of `tokens` over every discovered document — a ceiling if everything
   *  were attached, never a current cost (spec R3a, D4). */
  total_tokens: z.number().int(),
});
export type ProjectContextList = z.infer<typeof ProjectContextList>;

/** Response of `GET /repos/:id/context/doc?path=…` (spec R2). */
export const ProjectContextDocDetail = z.object({
  path: z.string(),
  content: z.string(),
  tokens: z.number().int().nullish(),
  attachments: z.array(
    z.object({ target_kind: z.enum(['agent', 'skill']), target_id: z.string(), order: z.number().int() }),
  ),
  github_url: z.string().nullish(),
  missing: z.boolean(),
});
export type ProjectContextDocDetail = z.infer<typeof ProjectContextDocDetail>;

/**
 * A document-to-target attachment, mirroring `AgentSkillLink`
 * (`contracts/knowledge.ts:376-381`), which already carries `order` — the
 * order the run-time cap (spec R8) drops from.
 */
export const ProjectContextAttachment = z.object({
  path: z.string(),
  target_kind: z.enum(['agent', 'skill']),
  target_id: z.string(),
  order: z.number().int(),
});
export type ProjectContextAttachment = z.infer<typeof ProjectContextAttachment>;

export const IndexStatus = z.object({
  status: z.enum(['idle', 'cloning', 'parsing', 'embedding', 'done', 'error']),
  pct: z.number().min(0).max(100),
  message: z.string().nullish(),
  chunks_indexed: z.number().int().nullish(),
});
export type IndexStatus = z.infer<typeof IndexStatus>;

// ---- Run request (review trigger; owned by A2, contract lives here) ----
export const RunRequest = z.object({
  agentId: z.string().optional(),
  all: z.boolean().optional(),
  /** Multi-agent subset selection; takes precedence over `agentId`/`all`. Capped
   *  as a cost fuse, not a UI limit — see the picker's own client-side cap. */
  agentIds: z.array(z.string()).min(1).max(8).optional(),
});
export type RunRequest = z.infer<typeof RunRequest>;

// ---- Structured API error envelope (returned by the API; UX taxonomy is FE) ----
export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
