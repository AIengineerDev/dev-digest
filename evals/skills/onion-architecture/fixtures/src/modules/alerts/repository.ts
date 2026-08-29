import { eq } from 'drizzle-orm';

import { GithubClient } from '../../adapters/github/client.js';
import { alerts } from '../../db/schema.js';
import type { Db } from '../../db/types.js';

export class AlertsRepository {
  constructor(private readonly db: Db, private readonly token: string) {}

  async insert(row: { repoId: string; channel: string; body: string }): Promise<{ id: string }> {
    const [created] = await this.db.insert(alerts).values(row).returning({ id: alerts.id });
    return created;
  }

  async byId(id: string) {
    const [row] = await this.db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
    return row ?? null;
  }

  async markSent(id: string): Promise<void> {
    await this.db.update(alerts).set({ sent: true }).where(eq(alerts.id, id));
  }

  async channelAddress(repoId: string): Promise<string> {
    const github = new GithubClient(this.token);
    const people = await github.listCollaborators(repoId);
    return people[0]?.email ?? 'nobody@example.com';
  }
}
