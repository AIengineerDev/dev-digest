/**
 * ci module — Export to CI (spec 15). Generates the deterministic file bundle
 * an agent exports as `.devdigest/**` + a GitHub Actions workflow, and (Phase
 * 4) installs it into a target repo.
 *
 * Reads agents and their linked skills through `container.agentsRepo` only —
 * never `modules/skills/repository.ts` or `modules/conventions/helpers.ts`,
 * which `no-cross-module-internals` (`.dependency-cruiser.cjs:70`) forbids.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AgentManifest, CiExport, CiExportInput, CiFile, CiRun } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { agentYaml, parseOwnerRepo, skillFile, slugify, uniqueSlugs } from './helpers.js';
import { reviewWorkflow } from './workflow.js';
import { CiRepository } from './repository.js';
import { MAX_FILE_BYTES, RUNNER_BUNDLE_PATH, RUNNER_COMMIT_PATH, SUPPORTED_POST_AS } from './constants.js';

export interface GeneratedExport {
  agent: AgentRow;
  agentSlug: string;
  files: CiFile[];
}

export class CiService {
  private readonly repo: CiRepository;

  constructor(private readonly container: Container) {
    this.repo = new CiRepository(container.db);
  }

  /**
   * Build the deterministic `CiFile[]` for one agent — the manifest, one file
   * per linked skill, and the workflow. Called for both `action: 'files'`
   * (preview) and `action: 'open_pr'` (Install regenerates rather than
   * trusting client-sent bytes — R3), so calling this twice for the same
   * agent must return byte-identical arrays (A3).
   */
  async generate(workspaceId: string, agentId: string, input: CiExportInput): Promise<GeneratedExport> {
    if (!SUPPORTED_POST_AS.includes(input.post_as as (typeof SUPPORTED_POST_AS)[number])) {
      throw new ValidationError(
        `post_as "${input.post_as}" is not supported — use "github_review" or "none".`,
        { supported: SUPPORTED_POST_AS },
      );
    }
    // Fails the whole export rather than silently accepting an unroutable
    // repo string — parseOwnerRepo also runs at Install (Phase 4), which is
    // where it actually matters, but validating it here too means a bad repo
    // string surfaces on Preview instead of only at the GitHub call.
    parseOwnerRepo(input.repo);

    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError(`Agent ${agentId} not found`);

    const agentSlug = slugify(agent.name);
    if (!agentSlug) {
      throw new ValidationError(
        `Agent "${agent.name}" has no safe slug (its name contains no letters or digits) — rename it before exporting.`,
        { agent: agent.name },
      );
    }

    const linked = await this.container.agentsRepo.linkedSkills(agent.id);
    const skillSlugs = uniqueSlugs(linked.map((l) => l.skill.name));

    const manifest: AgentManifest = {
      name: agent.name,
      provider: agent.provider,
      model: agent.model,
      system_prompt: agent.systemPrompt,
      skills: skillSlugs,
      strategy: agent.strategy,
      ci_fail_on: agent.ciFailOn,
    };

    const files: CiFile[] = [
      { path: `.devdigest/agents/${agentSlug}.yaml`, contents: agentYaml(manifest), editable: false },
      ...linked.map((l, i) => ({
        path: `.devdigest/skills/${skillSlugs[i]}.md`,
        contents: skillFile(l.skill),
        editable: false,
      })),
      {
        path: '.github/workflows/devdigest-review.yml',
        contents: reviewWorkflow({ slug: agentSlug, manifest, triggers: input.triggers }),
        editable: false,
      },
    ];

    for (const file of files) {
      if (Buffer.byteLength(file.contents, 'utf8') > MAX_FILE_BYTES) {
        throw new ValidationError(`Generated file "${file.path}" exceeds the 1 MB limit.`, {
          path: file.path,
        });
      }
    }

    return { agent, agentSlug, files };
  }

  /**
   * Install: regenerate (never trust `files` on the request — `CiExportInput`
   * has no such field, so this is enforced by validation, not discipline),
   * commit onto `devdigest/ci`, open or reuse the PR, and upsert one
   * `ci_installations` row per `(agent_id, repo)` (R7, C1, C2).
   *
   * GitHub errors propagate verbatim and no row is written on failure — the
   * service does not add a preflight or a rollback of its own.
   */
  async install(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiExport> {
    const { agent, files } = await this.generate(workspaceId, agentId, input);
    const { owner, name } = parseOwnerRepo(input.repo);
    const repoRef = { owner, name };
    const branch = 'devdigest/ci';

    const commitFiles = [
      ...files.map((f) => ({ path: f.path, contents: f.contents })),
      { path: RUNNER_COMMIT_PATH, contents: readRunnerBundle() },
    ];

    const github = await this.container.github();
    await github.commitFiles(repoRef, {
      branch,
      base: input.base,
      message: 'Add DevDigest CI review',
      files: commitFiles,
    });

    // C1/C2: reuse an existing open PR for this branch before trying to open
    // a new one; if GitHub refuses because one already exists (the exact
    // error shape is unverified — see plan "Risks"), fall back to the same
    // lookup rather than erroring.
    let prUrl: string;
    const existing = await github.findOpenPr(repoRef, branch);
    if (existing) {
      prUrl = existing.url;
    } else {
      try {
        const opened = await github.openPullRequest(repoRef, {
          title: 'Add DevDigest CI review',
          head: branch,
          base: input.base,
          body: `Adds \`.devdigest/agents/*.yaml\`, its skills and \`.github/workflows/devdigest-review.yml\` so **${agent.name}** reviews every pull request in this repository.`,
        });
        prUrl = opened.url;
      } catch (err) {
        const reused = await github.findOpenPr(repoRef, branch);
        if (!reused) throw err;
        prUrl = reused.url;
      }
    }

    const found = await this.repo.findByAgentAndRepo(agent.id, input.repo);
    const installation = found
      ? await this.repo.touchInstalledAt(found.id)
      : await this.repo.insert({ agentId: agent.id, repo: input.repo, targetType: input.target });

    return {
      installation: {
        id: installation.id,
        agent_id: installation.agentId,
        repo: installation.repo,
        target_type: installation.targetType,
        installed_at: installation.installedAt.toISOString(),
      },
      files,
      pr_url: prUrl,
    };
  }

  async listInstallations(workspaceId: string, agentId: string): Promise<CiExport['installation'][]> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError(`Agent ${agentId} not found`);

    const rows = await this.repo.listByAgent(agent.id);
    return rows.map((r) => ({
      id: r.id,
      agent_id: r.agentId,
      repo: r.repo,
      target_type: r.targetType,
      installed_at: r.installedAt.toISOString(),
    }));
  }

  /**
   * Every CI run in the workspace, newest first — what the `CI Runs` screen
   * reads.
   *
   * Unlike `listInstallations` there is no agent to resolve first: the
   * repository carries the workspace predicate through its
   * installation → agent join, so an empty list here means "none have run",
   * never "not yours".
   */
  async listRuns(workspaceId: string): Promise<CiRun[]> {
    const rows = await this.repo.listRuns(workspaceId);
    return rows.map((r) => ({ ...r, ran_at: r.ran_at ? r.ran_at.toISOString() : null }));
  }

  /**
   * Pull each repository's own GitHub Actions history into `ci_runs`.
   *
   * One repo failing does not fail the sync — a repo whose token cannot see
   * Actions, or which has none, is skipped and reported rather than aborting
   * the others. The count returned is rows actually inserted, so a second call
   * over the same window returns 0 and that is success, not a no-op bug.
   */
  async syncWorkflowRuns(workspaceId: string): Promise<{ inserted: number; skipped: string[] }> {
    const repos = await this.repo.listRepos(workspaceId);
    const github = await this.container.github();

    let inserted = 0;
    const skipped: string[] = [];

    for (const repo of repos) {
      try {
        const runs = await github.listWorkflowRuns({ owner: repo.owner, name: repo.name }, 50);
        inserted += await this.repo.ingestWorkflowRuns(
          repo.id,
          runs.map((r) => ({
            externalId: r.externalId,
            workflowName: r.workflowName,
            // `conclusion` is null while a run is still going; `status` carries
            // "in_progress"/"queued" then, and that is what should show.
            status: r.conclusion ?? r.status,
            prNumber: r.prNumber,
            htmlUrl: r.htmlUrl,
            ranAt: r.runStartedAt ? new Date(r.runStartedAt) : null,
          })),
        );
      } catch {
        skipped.push(repo.fullName);
      }
    }

    return { inserted, skipped };
  }
}

/**
 * Read the ncc-bundled runner (`agent-runner/dist/index.js`, gitignored — a
 * build artifact, never committed to this repo) from disk at Install time.
 * Fails with a clear message rather than committing an empty file into a
 * user's PR if the bundle has not been built (`cd agent-runner && npm run
 * build`) — the risk this plan's own "Risks and unknowns" section names.
 */
function readRunnerBundle(): string {
  const bundlePath = path.resolve(process.cwd(), RUNNER_BUNDLE_PATH);
  try {
    return readFileSync(bundlePath, 'utf8');
  } catch {
    throw new ValidationError(
      `agent-runner is not built — run "cd agent-runner && npm run build" so ${bundlePath} exists before exporting to CI.`,
      { bundlePath },
    );
  }
}
