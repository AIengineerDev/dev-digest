import { pgTable, uuid, text, integer, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { repos } from './repos';

export const ciInstallations = pgTable('ci_installations', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  repo: text('repo').notNull(),
  targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
  installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ciRuns = pgTable('ci_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
    onDelete: 'set null',
  }),
  prNumber: integer('pr_number'),
  ranAt: timestamp('ran_at', { withTimezone: true }),
  status: text('status'),
  findingsCount: integer('findings_count'),
  costUsd: doublePrecision('cost_usd'),
  githubUrl: text('github_url'),
  source: text('source'),
  /**
   * Set for a run ingested from a repository's own GitHub Actions; null for a
   * run an exported DevDigest agent reported back through its installation.
   * One of the two is always present — that is what scopes a row to a
   * workspace, since `ci_runs` has no workspace column of its own.
   */
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  /** The workflow's name for an ingested run; the agent's name comes from the join. */
  workflowName: text('workflow_name'),
  /** GitHub's own run id — the idempotency key that keeps re-sync from duplicating. */
  externalId: text('external_id'),
});
