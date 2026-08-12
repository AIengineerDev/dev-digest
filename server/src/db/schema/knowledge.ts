import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, integer, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * Extracted house rules awaiting (or carrying) a human verdict.
 *
 * Every row here has already passed the code-side evidence gate in
 * `modules/conventions/helpers.ts`: the file was sampled, it was readable, and
 * `evidence_snippet` really occurs at `evidence_line`. A candidate the model
 * proposed but whose evidence did not check out is never persisted, so this
 * table holds claims, not guesses.
 *
 * `head_sha` is the clone's HEAD at scan time and is what makes the evidence a
 * permalink; without it the UI would link at a moving branch.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    category: text('category', {
      enum: [
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
      ],
    })
      .notNull()
      .default('structure'),
    rule: text('rule').notNull(),
    rationale: text('rationale'),
    evidencePath: text('evidence_path').notNull(),
    evidenceLine: integer('evidence_line').notNull().default(1),
    evidenceSnippet: text('evidence_snippet').notNull(),
    confidence: doublePrecision('confidence').notNull().default(0),
    /** pending = nobody looked yet; rejected survives a re-scan, pending does not. */
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    headSha: text('head_sha'),
    createdAt: now(),
  },
  (t) => ({
    repoIdx: index('conventions_repo_idx').on(t.repoId),
  }),
);
