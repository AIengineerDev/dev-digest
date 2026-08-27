import { and, eq, or, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * project-context data-access. Owns `project_context_attachments`.
 *
 * Also reads `repos` directly for the basics (owner/name/default branch) a
 * clone lookup needs — the same pattern `repo-intel/repository.ts:getRepoBasics`
 * uses, not an import of the `repos` module's own repository (that would trip
 * `no-cross-module-internals`).
 */

export interface RepoBasics {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  defaultBranch: string;
}

export interface AttachmentRow {
  path: string;
  targetKind: 'agent' | 'skill';
  targetId: string;
  order: number;
}

export class ProjectContextRepository {
  constructor(private db: Db) {}

  async getRepoBasics(workspaceId: string, repoId: string): Promise<RepoBasics | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        workspaceId: t.repos.workspaceId,
        owner: t.repos.owner,
        name: t.repos.name,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Every attachment in a repo — every document, every target (list view). */
  async listAttachments(repoId: string): Promise<AttachmentRow[]> {
    return this.selectAttachments(eq(t.projectContextAttachments.repoId, repoId));
  }

  /** Attachments for one document path (doc detail + Skills/Agents tabs). */
  async attachmentsForPath(repoId: string, path: string): Promise<AttachmentRow[]> {
    return this.selectAttachments(
      and(eq(t.projectContextAttachments.repoId, repoId), eq(t.projectContextAttachments.path, path)) as SQL,
    );
  }

  /**
   * Attachments for a set of targets — an agent plus its linked skills — for
   * the assembler (A4). Never called for a target list of one kind only from
   * the reviews module directly; the caller hands ids in as values.
   */
  async attachmentsForTargets(
    repoId: string,
    targets: Array<{ kind: 'agent' | 'skill'; id: string }>,
  ): Promise<AttachmentRow[]> {
    if (targets.length === 0) return [];
    const targetConditions = targets.map(
      (tg) =>
        and(
          eq(t.projectContextAttachments.targetKind, tg.kind),
          eq(t.projectContextAttachments.targetId, tg.id),
        ) as SQL,
    );
    return this.selectAttachments(
      and(eq(t.projectContextAttachments.repoId, repoId), or(...targetConditions)) as SQL,
    );
  }

  private async selectAttachments(where: SQL): Promise<AttachmentRow[]> {
    const rows = await this.db
      .select({
        path: t.projectContextAttachments.path,
        targetKind: t.projectContextAttachments.targetKind,
        targetId: t.projectContextAttachments.targetId,
        order: t.projectContextAttachments.order,
      })
      .from(t.projectContextAttachments)
      .where(where);
    return rows.map((r) => ({
      path: r.path,
      targetKind: r.targetKind as 'agent' | 'skill',
      targetId: r.targetId,
      order: r.order,
    }));
  }

  /**
   * Set `order` for one target across the given paths, and touch nothing
   * else: no other target's rows are read or written, and a path not
   * currently attached to this target is never inserted (the caller,
   * `ProjectContextService.setOrder`, has already filtered `paths` down to
   * the target's existing attachments — this method trusts that and just
   * writes). Individual `UPDATE`s, not a single `CASE WHEN`, because the
   * server has no transaction usage anywhere (`setAttachmentsForPath`
   * above) and the row count here is bounded by one target's attachment
   * count, never `MAX_DOCUMENTS`.
   */
  async setOrderForTarget(
    repoId: string,
    targetKind: 'agent' | 'skill',
    targetId: string,
    orderedPaths: string[],
  ): Promise<void> {
    await Promise.all(
      orderedPaths.map((path, order) =>
        this.db
          .update(t.projectContextAttachments)
          .set({ order })
          .where(
            and(
              eq(t.projectContextAttachments.repoId, repoId),
              eq(t.projectContextAttachments.targetKind, targetKind),
              eq(t.projectContextAttachments.targetId, targetId),
              eq(t.projectContextAttachments.path, path),
            ),
          ),
      ),
    );
  }

  /**
   * Replace the full attachment set for one document. Two sequential
   * statements, not a transaction: the server has none historically
   * (`server/INSIGHTS.md`, 2026-08-09 — "there is no transaction anywhere in
   * the server"), and a single document's attachment set is exactly the "last
   * write wins, no merge dialog" write C9 already assumes.
   */
  async setAttachmentsForPath(
    workspaceId: string,
    repoId: string,
    path: string,
    attachments: Array<{ targetKind: 'agent' | 'skill'; targetId: string; order: number }>,
  ): Promise<void> {
    await this.db
      .delete(t.projectContextAttachments)
      .where(and(eq(t.projectContextAttachments.repoId, repoId), eq(t.projectContextAttachments.path, path)));
    if (attachments.length === 0) return;
    await this.db.insert(t.projectContextAttachments).values(
      attachments.map((a) => ({
        workspaceId,
        repoId,
        path,
        targetKind: a.targetKind,
        targetId: a.targetId,
        order: a.order,
      })),
    );
  }
}
