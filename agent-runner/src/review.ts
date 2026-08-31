import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Octokit } from '@octokit/rest';
import {
  OpenRouterProvider,
  reviewPullRequest,
  toReviewPayload,
  countBlockers,
  wrapUntrusted,
} from '@devdigest/reviewer-core';
import type { AgentManifest } from '@devdigest/shared';
import { computeDiff } from './diff.js';
import { requireProviderKey } from './env.js';
import { logRun } from './log.js';
import { postReview, parseRepo } from './github.js';

export interface RunOptions {
  manifest: AgentManifest;
  /** The repo checkout root — where `.devdigest/skills/**` lives and where
   * `git diff` is run. */
  cwd: string;
  base: string;
  head: string;
  githubRepository: string;
  githubToken: string;
  prNumber: number;
  /**
   * The `--fail-on` CLI flag baked into the generated workflow at export
   * time — audit-only. The gate itself always uses `manifest.ci_fail_on`
   * (plan Phase 2: "No gate arithmetic is reimplemented"); this is logged
   * so a drift between the two (e.g. the agent's gate was edited in the
   * studio after the workflow was generated) is visible, not silent.
   */
  configuredFailOn?: string;
}

/**
 * Load one linked skill's body from the checkout and wrap it as untrusted
 * content — the same treatment `server/src/modules/skills/assembler.ts:184`
 * gives non-first-party bodies (R12). A skill's own text can claim to be
 * instructions; it never is.
 */
function loadSkill(cwd: string, slug: string): string {
  const body = readFileSync(path.join(cwd, '.devdigest/skills', `${slug}.md`), 'utf8');
  return wrapUntrusted(slug, body);
}

/**
 * Run one agent's review against one PR and return the process exit code.
 * Never throws for an expected condition (missing key, empty diff,
 * unsupported provider) — each of those is a **logged, non-crashing**
 * outcome with its own documented exit code (C8, C9). Only truly
 * unexpected errors (a thrown `git`, a thrown fs read) propagate to the
 * caller in `index.ts`.
 */
export async function run(opts: RunOptions): Promise<number> {
  const { manifest } = opts;

  // Provider narrowing (plan Phase 2): only openrouter ships in CI v1. This
  // narrows R5's provider-key generality at RUNTIME while the generated
  // workflow still names the correct secret for all three providers.
  if (manifest.provider !== 'openrouter') {
    console.error(
      `Provider "${manifest.provider}" is not supported in CI v1 — only "openrouter" agents ` +
        'can run through agent-runner today.',
    );
    return 1;
  }

  let apiKey: string;
  try {
    apiKey = requireProviderKey(manifest.provider);
  } catch (err) {
    // C8: a missing key never looks like a clean review.
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const diff = await computeDiff(opts.base, opts.head, opts.cwd);
  if (diff.files.length === 0) {
    // C9: an empty diff (e.g. a shallow checkout missing `head` —
    // server/INSIGHTS.md:288-294) is reported as "no reviewable diff", never
    // as a clean review with zero findings.
    logRun({ agent: manifest.name, model: manifest.model, message: 'no reviewable diff', exitCode: 0 });
    return 0;
  }

  const skills = manifest.skills.map((slug) => loadSkill(opts.cwd, slug));

  const llm = new OpenRouterProvider(apiKey);
  const outcome = await reviewPullRequest({
    systemPrompt: manifest.system_prompt,
    model: manifest.model,
    diff,
    llm,
    skills,
    strategy: manifest.strategy,
  });

  const payload = toReviewPayload(outcome.review, { failOn: manifest.ci_fail_on, diff });
  // No gate arithmetic reimplemented: the exit code is exactly
  // countBlockers(findings, manifest.ci_fail_on) > 0 ? 1 : 0.
  const blockers = countBlockers(outcome.review.findings, manifest.ci_fail_on);
  const exitCode = blockers > 0 ? 1 : 0;

  const octokit = new Octokit({ auth: opts.githubToken });
  const repo = parseRepo(opts.githubRepository);
  try {
    await postReview(octokit, repo, opts.prNumber, payload);
  } catch (err) {
    // A posting failure does not swallow the gate — the exit code below
    // still reflects the findings even if GitHub never saw them.
    console.error('Failed to post review:', err instanceof Error ? err.message : String(err));
  }

  if (opts.configuredFailOn && opts.configuredFailOn !== manifest.ci_fail_on) {
    console.error(
      `Note: the workflow was generated with --fail-on ${opts.configuredFailOn}, but the ` +
        `agent's current gate is ${manifest.ci_fail_on} — the manifest committed in this ` +
        're-export is the one that ran. Re-export the agent to refresh the workflow.',
    );
  }

  logRun({
    agent: manifest.name,
    model: manifest.model,
    message: 'reviewed',
    files: diff.files.length,
    lines: diff.files.reduce((n, f) => n + f.additions + f.deletions, 0),
    grounding: outcome.grounding,
    blockers,
    exitCode,
  });

  return exitCode;
}
