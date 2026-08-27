import { eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import * as t from '../../db/schema.js';
import type { WebhookRow } from '@devdigest/shared';

export class WebhookRepository {
  constructor(private readonly db: Db) {}

  async create(
    workspaceId: string,
    url: string,
    events: string[],
    secret: string,
  ): Promise<WebhookRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.webhooks)
        .values({ workspaceId, url, secret, enabled: true })
        .returning();
      await tx.insert(t.webhookEvents).values(events.map((e) => ({ webhookId: row!.id, event: e })));
      return row!;
    });
  }

  async get(id: string): Promise<WebhookRow | undefined> {
    const [row] = await this.db.select().from(t.webhooks).where(eq(t.webhooks.id, id));
    return row;
  }

  async listDeliveries(webhookId: string) {
    return this.db.select().from(t.webhookDeliveries).where(eq(t.webhookDeliveries.webhookId, webhookId));
  }

  async recordDelivery(
    webhookId: string,
    event: string,
    status: number,
    attempt: number,
  ): Promise<void> {
    await this.db.insert(t.webhookDeliveries).values({ webhookId, event, status, attempt });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(t.webhooks).where(eq(t.webhooks.id, id));
  }
}
