import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

/**
 * A pinned reference to a skill: which skill, and which snapshot of its body.
 *
 * `version: null` means a legacy row where the skill version was not recorded —
 * an `agent_versions` snapshot written before pinning existed. Null is honest
 * ("we do not know which skill text this ran with"); it is never backfilled,
 * because inventing a version would invent history.
 */
export const SkillRef = z.object({
  id: z.string(),
  version: z.number().int().nullable(),
});
export type SkillRef = z.infer<typeof SkillRef>;

/**
 * Read-tolerant form of `SkillRef`. Accepts the legacy bare-string id as well as
 * the object form, and normalises both to `SkillRef`: `"s1"` → `{ id: "s1",
 * version: null }`. New writes always use the object form.
 */
export const SkillRefTolerant = z
  .union([z.string(), SkillRef])
  .transform((value): SkillRef =>
    typeof value === 'string' ? { id: value, version: null } : value,
  );

/** Write shape for creating a skill. `source` is always 'manual' in v1. */
export const CreateSkillInput = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  enabled: z.boolean().default(true),
});
export type CreateSkillInput = z.infer<typeof CreateSkillInput>;

/** Partial patch of a skill — every field optional. */
export const UpdateSkillInput = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateSkillInput = z.infer<typeof UpdateSkillInput>;

/**
 * Import a skill body from a URL.
 *
 * The imported text is **untrusted data**, not author-written instruction: it
 * arrives from outside the workspace, so it is wrapped like every other external
 * block when it reaches a prompt (`specs/02-skills.md`, *Security*). Name,
 * description and type may be supplied; anything omitted is derived from the
 * fetched document.
 */
export const ImportSkillInput = z.object({
  url: z.string().url(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
});
export type ImportSkillInput = z.infer<typeof ImportSkillInput>;

/** An immutable snapshot of a skill body, appended on every body change. */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----

/**
 * What kind of rule a convention states. A closed list on purpose: it is what
 * the extraction prompt asks the model to choose from, so an open string would
 * produce a new category per run and nothing could be grouped.
 */
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'error-handling',
  'testing',
  'typing',
  'api',
  'async',
  'logging',
  'imports',
  'security',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/**
 * Review state of a candidate.
 *
 * `pending` (nobody has looked) and `rejected` (somebody looked and said no) are
 * deliberately different: a re-scan discards the first and preserves the second,
 * so a rule you rejected does not come back every time you press Re-scan.
 */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/**
 * One extracted house rule, with the evidence that survived verification.
 *
 * `evidence_line` is 1-based and always points at a line where
 * `evidence_snippet` really occurs — the server corrects the model's number
 * rather than trusting it. `head_sha` is the commit the clone was on when the
 * scan ran, which is what makes the GitHub permalink honest: it points at the
 * code the claim was made about, not at whatever that file says now.
 */
export const Convention = z.object({
  id: z.string(),
  repo_id: z.string().nullable(),
  category: ConventionCategory,
  rule: z.string(),
  rationale: z.string().nullable(),
  evidence_path: z.string(),
  evidence_line: z.number().int().positive(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  head_sha: z.string().nullable(),
  created_at: z.string(),
});
export type Convention = z.infer<typeof Convention>;

/**
 * The result of one scan. The three counts are the point: `proposed` is what the
 * model claimed, `verified` is what survived the code-side evidence gate, and
 * `dropped` is the difference — the extraction's own precision, visible instead
 * of folded into the list.
 */
export const ExtractConventionsResult = z.object({
  sampled_files: z.array(z.string()),
  proposed: z.number().int(),
  verified: z.number().int(),
  dropped: z.number().int(),
  conventions: z.array(Convention),
});
export type ExtractConventionsResult = z.infer<typeof ExtractConventionsResult>;

/** Patch a candidate: sharpen the rule, re-categorise it, accept or reject it. */
export const UpdateConventionInput = z.object({
  rule: z.string().min(1).optional(),
  category: ConventionCategory.optional(),
  status: ConventionStatus.optional(),
});
export type UpdateConventionInput = z.infer<typeof UpdateConventionInput>;

/**
 * Promote the accepted candidates of a repo into one skill.
 *
 * `body` is optional because the server composes a default from the accepted
 * set; when the user edited it in the modal, theirs wins. `convention_ids`
 * narrows the set — omitted means "every accepted candidate for this repo".
 */
export const CreateSkillFromConventionsInput = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType.default('convention'),
  body: z.string().optional(),
  convention_ids: z.array(z.string()).optional(),
});
export type CreateSkillFromConventionsInput = z.infer<typeof CreateSkillFromConventionsInput>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  // Tolerant on read: existing rows hold bare skill ids, new snapshots hold
  // `{ id, version }`. Both normalise to SkillRef[]; legacy rows keep parsing
  // with `version: null` and are deliberately never rewritten.
  skills: z.array(SkillRefTolerant),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
