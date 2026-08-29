import { alerts } from '../../db/schema.js';

export type AlertRow = typeof alerts.$inferSelect;

export function renderAlertBody(body: string, window: string): string {
  return `[${window}] ${body.trim()}`;
}

export function isQuietHours(now: Date): boolean {
  const hour = now.getUTCHours();
  return hour >= 22 || hour < 7;
}

export function unsentOf(rows: AlertRow[]): AlertRow[] {
  return rows.filter((row) => !row.sent);
}
