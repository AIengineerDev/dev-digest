import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull(),
  channel: text('channel').notNull(),
  body: text('body').notNull(),
  sent: boolean('sent').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const digests = pgTable('digests', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').notNull(),
  window: text('window').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
