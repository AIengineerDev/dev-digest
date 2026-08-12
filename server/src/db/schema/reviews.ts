import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, boolean } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  /** PR head this review was produced against. See `agent_runs.head_sha`. */
  headSha: text('head_sha'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  // ---- Derived intent (specs/04-intent-layer.md) — add-only -----------------
  category: text('category'),
  summary: text('summary'),
  confidence: doublePrecision('confidence'),
  /** Denormalised so UI and SQL never re-derive the confidence thresholds. */
  band: text('band'),
  /** Every source considered, including the ones that failed — what makes a
   *  wrong intent diagnosable. */
  sources: jsonb('sources').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  provider: text('provider'),
  model: text('model'),
  promptVersion: integer('prompt_version').notNull().default(1),
  /** sha256 of the canonical signal set; a matching fingerprint skips reclassification. */
  fingerprint: text('fingerprint'),
  /** true when classification failed/timed out — never served from cache. */
  degraded: boolean('degraded').notNull().default(false),
  error: text('error'),
  derivedAt: timestamp('derived_at', { withTimezone: true }),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
