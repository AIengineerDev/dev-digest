import type { RepoRef } from '@devdigest/shared';
import type {
  Convention,
  CreateSkillFromConventionsInput,
  ExtractConventionsResult,
  Skill,
  UpdateConventionInput,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { Db } from '../../db/client.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../_shared/feature-models.js';
import { withFeatureProviderContext } from '../_shared/provider-errors.js';
import {
  CONFIG_SAMPLE_PATHS,
  CONVENTIONS_SKILL_TYPE,
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TEMPERATURE,
  MAX_CANDIDATES,
  MAX_FILE_SAMPLE_CHARS,
  MAX_TOTAL_SAMPLE_CHARS,
  MIN_CONFIDENCE,
  SAMPLE_FILE_COUNT,
} from './constants.js';
import {
  buildConventionsSkillBody,
  evidenceFilesOf,
  findEvidenceLine,
  joinSamples,
  normalizeCodeLine,
  renderNumberedFile,
  toConventionDto,
} from './helpers.js';
import {
  ExtractionResponse,
  extractionSystemPrompt,
  extractionUserPrompt,
  type ProposedConvention,
} from './prompt.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';

/**
 * Conventions service — scan a repo, propose house rules, keep only the ones
 * whose evidence checks out, and promote the accepted ones into a skill.
 *
 * The ordering is the design: sampling is code, the model only proposes, and
 * verification is code again. The model never decides what gets stored, which is
 * why a candidate in the database can be trusted enough to show a human with a
 * link to the line it came from.
 */

/** A sampled file and its source, as read from the clone. */
interface SampledFile {
  path: string;
  source: string;
}

export class ConventionsService {
  private repo: ConventionsRepository;
  private db: Db;

  constructor(private container: Container) {
    this.db = container.db;
    this.repo = new ConventionsRepository(container.db);
  }

  async list(
    workspaceId: string,
    repoId: string,
    filter: { status?: Convention['status'] } = {},
  ): Promise<Convention[]> {
    const rows = await this.repo.listForRepo(workspaceId, repoId, filter);
    return rows.map(toConventionDto);
  }

  /** Patch one candidate. Undefined = not this workspace's row (route → 404). */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionInput,
  ): Promise<Convention | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  // ------------------------------------------------------------- extraction

  /**
   * One scan: sample → propose → verify → replace the pending set.
   *
   * The write is a transaction because the two statements together mean "these
   * are now the undecided candidates for this repo". Deleting without inserting
   * would silently empty the screen; inserting without deleting would double
   * every rule on a re-scan.
   */
  async extract(workspaceId: string, repoId: string): Promise<ExtractConventionsResult> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const files = await this.sample(repoId, ref);
    if (files.length === 0) {
      throw new ValidationError(
        'No sampled files could be read from the clone. Import and index the repo first.',
        { repoId },
      );
    }

    const headSha = await this.container.git.currentHead(ref).catch(() => null);
    const proposals = await this.propose(workspaceId, repo.fullName, files);

    const sampled = new Map(files.map((f) => [f.path, f.source]));
    const existing = await this.repo.listForRepo(workspaceId, repoId);
    const decidedRules = new Set(
      existing.filter((r) => r.status !== 'pending').map((r) => normalizeRule(r.rule)),
    );

    const verified = this.verify(proposals, sampled, decidedRules);

    const rows = await this.db.transaction(async (tx) => {
      await this.repo.deletePendingForRepo(workspaceId, repoId, tx);
      return this.repo.insertMany(
        verified.map(
          (c): InsertConvention => ({
            workspaceId,
            repoId,
            category: c.category,
            rule: c.rule,
            rationale: c.rationale.trim() === '' ? null : c.rationale,
            evidencePath: c.evidence_path,
            evidenceLine: c.evidence_line,
            evidenceSnippet: c.evidence_snippet,
            confidence: c.confidence,
            headSha,
          }),
        ),
        tx,
      );
    });

    // The decided rows are part of the screen too — a re-scan must not look like
    // it deleted the work someone already did.
    const all = await this.repo.listForRepo(workspaceId, repoId);

    return {
      sampled_files: files.map((f) => f.path),
      proposed: proposals.length,
      verified: rows.length,
      dropped: proposals.length - rows.length,
      conventions: all.map(toConventionDto),
    };
  }

  /**
   * Choose and read the sample — entirely in code, no model involved.
   *
   * Two sources, because they fail in opposite directions: `file_rank` finds the
   * files that matter but deliberately excludes configs, and the configs are
   * where a repo states rules outright. Unreadable files are skipped rather than
   * fatal; a repo cloned shallowly or missing a config is normal.
   */
  private async sample(repoId: string, ref: RepoRef): Promise<SampledFile[]> {
    const ranked = await this.container.repoIntel
      .getConventionSamples(repoId, SAMPLE_FILE_COUNT)
      .catch(() => [] as string[]);
    const paths = [...CONFIG_SAMPLE_PATHS, ...ranked];

    const files: SampledFile[] = [];
    for (const path of paths) {
      const source = await this.container.git.readFile(ref, path).catch(() => null);
      if (source === null || source.trim() === '') continue;
      files.push({ path, source });
    }
    return files;
  }

  /** Ask the workspace's configured conventions model for candidates. */
  private async propose(
    workspaceId: string,
    repoFullName: string,
    files: SampledFile[],
  ): Promise<ProposedConvention[]> {
    const rendered = files.map((f) => renderNumberedFile(f.path, f.source, MAX_FILE_SAMPLE_CHARS));
    const sample = joinSamples(rendered, MAX_TOTAL_SAMPLE_CHARS);

    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await withFeatureProviderContext(
      { id: 'conventions', label: 'Conventions', provider: choice.provider, model: choice.model },
      () => this.container.llm(choice.provider),
    );

    const result = await llm.completeStructured({
      model: choice.model,
      schema: ExtractionResponse,
      schemaName: EXTRACTION_SCHEMA_NAME,
      temperature: EXTRACTION_TEMPERATURE,
      maxTokens: EXTRACTION_MAX_TOKENS,
      messages: [
        { role: 'system', content: extractionSystemPrompt() },
        {
          role: 'user',
          content: extractionUserPrompt(
            repoFullName,
            sample,
            files.map((f) => f.path),
          ),
        },
      ],
    });

    return result.data.conventions;
  }

  /**
   * The evidence gate. Everything the model claimed is checked against the files
   * it was actually shown, and anything that fails is dropped, not softened.
   *
   * The one forgiving step is the line number: a snippet found at a different
   * line is corrected rather than rejected, because the snippet is the claim and
   * the number is a pointer. See `findEvidenceLine`.
   */
  private verify(
    proposals: ProposedConvention[],
    sampled: Map<string, string>,
    decidedRules: Set<string>,
  ): (ProposedConvention & { evidence_line: number })[] {
    const kept: (ProposedConvention & { evidence_line: number })[] = [];
    const seen = new Set(decidedRules);

    for (const c of proposals) {
      if (kept.length >= MAX_CANDIDATES) break;
      if (c.confidence < MIN_CONFIDENCE) continue;

      const source = sampled.get(c.evidence_path) ?? sampled.get(stripLeadingDot(c.evidence_path));
      if (source === undefined) continue;

      const check = findEvidenceLine(source, c.evidence_snippet, c.evidence_line);
      if (!check.ok) continue;

      // Exact-text dedupe only. Fuzzy matching would quietly swallow a sharper
      // restatement of a rule someone rejected once, which is exactly the case
      // where a second look is worth having.
      const key = normalizeRule(c.rule);
      if (seen.has(key)) continue;
      seen.add(key);

      kept.push({ ...c, evidence_line: check.line });
    }
    return kept;
  }

  // ------------------------------------------------------ promotion to skill

  /**
   * Merge the accepted candidates into one skill.
   *
   * Rejected and pending rows cannot reach it: the query filters on
   * `status = 'accepted'`, so the UI's checkbox state is not what decides — the
   * persisted verdict is. `source: 'extracted'` and `evidence_files` are what
   * make the resulting skill traceable back to the code that produced it.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateSkillFromConventionsInput,
  ): Promise<Skill> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const rows = await this.repo.listAccepted(workspaceId, repoId, input.convention_ids);
    if (rows.length === 0) {
      throw new ValidationError('No accepted conventions to build a skill from.', { repoId });
    }

    const accepted = rows.map(toConventionDto);
    const body = input.body ?? buildConventionsSkillBody(repo.fullName, accepted);

    return this.container.skillsWriter.create(
      workspaceId,
      {
        name: input.name,
        description: input.description,
        type: input.type ?? CONVENTIONS_SKILL_TYPE,
        body,
        enabled: true,
      },
      { source: 'extracted', evidenceFiles: evidenceFilesOf(accepted) },
    );
  }
}

/** Dedupe key for a rule: case- and whitespace-insensitive, nothing cleverer. */
function normalizeRule(rule: string): string {
  return normalizeCodeLine(rule).toLowerCase();
}

/** `./src/a.ts` and `src/a.ts` are the same file to everyone except a Map. */
function stripLeadingDot(path: string): string {
  return path.replace(/^\.\//, '');
}
