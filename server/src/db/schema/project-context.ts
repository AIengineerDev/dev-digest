import { pgTable, uuid, text, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Project context

/**
 * `project_context_attachments` — which `.md` documents (identified by
 * repo-relative path) are attached to which agent or skill
 * (specs/09-project-context.md, T3).
 *
 * Deliberately its own file, not an addition to `schema/context.ts`: that file
 * is the code index (chunks/symbols/references), and `.md` stays outside
 * `SUPPORTED_EXT` by design (`modules/repo-intel/constants.ts`).
 *
 * No documents table. Documents are files in the clone, not rows — read on
 * demand via `git.readFile`. That is what makes R10 (a deleted attached
 * document is "missing", never silently detached) free: nothing here points
 * at a row that could be deleted out from under it, only at a path that may
 * or may not currently exist on disk.
 *
 * PK mirrors `agent_skills` (`schema/agents.ts:52-64`) with two extra
 * dimensions (`path`, `target_kind`) since one document can attach to many
 * targets of either kind, and one target can have many documents.
 */
export const projectContextAttachments = pgTable(
  'project_context_attachments',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    targetKind: text('target_kind', { enum: ['agent', 'skill'] }).notNull(),
    /** Agent id or skill id, depending on `target_kind`. No FK: it points into
     *  one of two tables and Postgres has no polymorphic FK. */
    targetId: uuid('target_id').notNull(),
    /** Attachment order — what R8's run-time cap drops from, tail first. */
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.path, t.targetKind, t.targetId] }),
  }),
);
