import type { Container } from '../../platform/container.js';
import type {
  ProjectContextAttachment,
  ProjectContextDoc,
  ProjectContextDocDetail,
  ProjectContextList,
  RepoRef,
} from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_FILE_SIZE } from '../_shared/walk-limits.js';
import { discoverDocuments } from './discovery.js';
import { countsForPath, isPathWithinClone, mapWithConcurrency } from './helpers.js';
import { ProjectContextRepository, type AttachmentRow } from './repository.js';
import { DocumentTokenCounter } from './token-counter.js';
import { DOC_READ_CONCURRENCY, MAX_DOCUMENTS } from './constants.js';

/**
 * project-context service. The module earns this layer: it orchestrates two
 * sources (the filesystem clone + `project_context_attachments`) and applies
 * real rules (containment, the size ceiling, dedup-by-path counts) — not a
 * pass-through to the repository.
 */
export class ProjectContextService {
  private repo: ProjectContextRepository;
  private tokens: DocumentTokenCounter;

  constructor(private container: Container) {
    this.repo = new ProjectContextRepository(container.db);
    this.tokens = new DocumentTokenCounter(container.git, container.tokenizer);
  }

  /**
   * `GET /repos/:id/context` — every discovered `.md`/`.markdown` document,
   * plus any attached document that a rescan no longer finds on disk (R10),
   * shown as `missing` rather than silently dropped.
   */
  async listDocuments(workspaceId: string, repoId: string): Promise<ProjectContextList> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');
    const ref: RepoRef = { owner: repoBasics.owner, name: repoBasics.name };
    const clonePath = this.container.git.clonePathFor(ref);

    const [discovery, attachmentRows, headSha] = await Promise.all([
      discoverDocuments(clonePath),
      this.repo.listAttachments(repoId),
      this.safeCurrentHead(ref),
    ]);

    const attachmentsByPath = groupByPath(attachmentRows);
    const discoveredPaths = new Set(discovery.docs.map((d) => d.path));

    const discoveredDocs = await mapWithConcurrency(discovery.docs, DOC_READ_CONCURRENCY, async (d) => {
      const counts = countsForPath(attachmentsByPath.get(d.path) ?? []);
      const tokens = await this.tokens.countPath(ref, d.path);
      const doc: ProjectContextDoc = {
        path: d.path,
        size: d.size,
        tokens,
        agent_count: counts.agent,
        skill_count: counts.skill,
        missing: false,
        too_large: d.tooLarge,
      };
      return doc;
    });

    const missingDocs: ProjectContextDoc[] = [];
    for (const [path, rows] of attachmentsByPath) {
      if (discoveredPaths.has(path)) continue;
      const counts = countsForPath(rows);
      missingDocs.push({
        path,
        size: 0,
        tokens: null,
        agent_count: counts.agent,
        skill_count: counts.skill,
        missing: true,
        too_large: false,
      });
    }

    const docs = [...discoveredDocs, ...missingDocs].sort((a, b) => a.path.localeCompare(b.path));
    const total_tokens = docs.reduce((sum, d) => sum + (d.tokens ?? 0), 0);

    return {
      docs,
      head_sha: headSha,
      truncated: discovery.truncated,
      limit: MAX_DOCUMENTS,
      total_tokens,
    };
  }

  /** `GET /repos/:id/context/doc?path=…` — one document's rendered content. */
  async getDocument(workspaceId: string, repoId: string, path: string): Promise<ProjectContextDocDetail> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');
    const ref: RepoRef = { owner: repoBasics.owner, name: repoBasics.name };
    const clonePath = this.container.git.clonePathFor(ref);
    if (!isPathWithinClone(clonePath, path)) {
      // AppError (400), not ValidationError (422): this is containment, not a
      // shape/business-rule rejection — R11 requires "no path outside the
      // clone root is ever read", so nothing below this throw touches disk.
      throw new AppError('path_escapes_clone', 'Path escapes the repository clone', 400, { path });
    }

    let content = '';
    let missing = false;
    try {
      content = await this.container.git.readFile(ref, path);
    } catch {
      missing = true;
    }

    const tokens = missing ? null : this.tokens.countContent(content);
    const attachmentRows = await this.repo.attachmentsForPath(repoId, path);

    return {
      path,
      content,
      tokens,
      attachments: attachmentRows.map((a) => ({ target_kind: a.targetKind, target_id: a.targetId })),
      github_url: missing
        ? null
        : `https://github.com/${repoBasics.owner}/${repoBasics.name}/blob/${repoBasics.defaultBranch}/${path}`,
      missing,
    };
  }

  /**
   * `PUT /repos/:id/context/attachments` — replace the full attachment set for
   * one document. Order is computed server-side, per target, as an append
   * (the current UI has no drag-reorder for documents, unlike skills) so the
   * caller never has to know another target's existing order.
   */
  async setAttachments(
    workspaceId: string,
    repoId: string,
    path: string,
    targets: Array<{ targetKind: 'agent' | 'skill'; targetId: string }>,
  ): Promise<ProjectContextAttachment[]> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');
    const ref: RepoRef = { owner: repoBasics.owner, name: repoBasics.name };
    const clonePath = this.container.git.clonePathFor(ref);
    if (!isPathWithinClone(clonePath, path)) {
      // AppError (400), not ValidationError (422): this is containment, not a
      // shape/business-rule rejection — R11 requires "no path outside the
      // clone root is ever read", so nothing below this throw touches disk.
      throw new AppError('path_escapes_clone', 'Path escapes the repository clone', 400, { path });
    }
    if (await this.isTooLarge(ref, path)) {
      throw new ValidationError('Document exceeds the attach size limit', { path, limit: MAX_FILE_SIZE });
    }

    const withOrder: Array<{ targetKind: 'agent' | 'skill'; targetId: string; order: number }> = [];
    for (const target of targets) {
      const existing = (
        await this.repo.attachmentsForTargets(repoId, [{ kind: target.targetKind, id: target.targetId }])
      ).filter((a) => a.path !== path);
      const nextOrder = existing.reduce((max, a) => Math.max(max, a.order), -1) + 1;
      withOrder.push({ ...target, order: nextOrder });
    }

    await this.repo.setAttachmentsForPath(workspaceId, repoId, path, withOrder);
    return withOrder.map((a) => ({ path, target_kind: a.targetKind, target_id: a.targetId, order: a.order }));
  }

  /** Documents attached to a set of targets — the assembler's read side. */
  async attachmentsForTargets(
    repoId: string,
    targets: Array<{ kind: 'agent' | 'skill'; id: string }>,
  ): Promise<AttachmentRow[]> {
    return this.repo.attachmentsForTargets(repoId, targets);
  }

  async getRepoBasics(workspaceId: string, repoId: string) {
    return this.repo.getRepoBasics(workspaceId, repoId);
  }

  private async safeCurrentHead(ref: RepoRef): Promise<string | null> {
    try {
      return await this.container.git.currentHead(ref);
    } catch {
      return null;
    }
  }

  /**
   * Through the git port (`readFile`), not a raw `fs.stat` on the clone path —
   * `GitClient` has no stat method, and reading is what makes this correct
   * against a mocked git client in tests, not only against a real clone on
   * disk. Content length in bytes, not JS string length (UTF-16 code units).
   */
  private async isTooLarge(ref: RepoRef, path: string): Promise<boolean> {
    try {
      const content = await this.container.git.readFile(ref, path);
      return Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE;
    } catch {
      // Unreadable/missing — can't check, and refusing to attach a document
      // that may come back on a rescan (R10) would be the wrong failure mode.
      return false;
    }
  }
}

function groupByPath(rows: AttachmentRow[]): Map<string, AttachmentRow[]> {
  const byPath = new Map<string, AttachmentRow[]>();
  for (const row of rows) {
    const list = byPath.get(row.path) ?? [];
    list.push(row);
    byPath.set(row.path, list);
  }
  return byPath;
}
