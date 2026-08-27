import type { HttpClient, WebhookCreate, WebhookRow } from '@devdigest/shared';
import type { WebhookRepository } from './repository.js';
import { summariseFindings } from '../reviews/helpers.js';
import { DELIVERY_TIMEOUT_MS, MAX_ATTEMPTS } from './constants.js';

export class WebhookService {
  constructor(
    private readonly repo: WebhookRepository,
    private readonly http: HttpClient,
  ) {}

  async register(workspaceId: string, input: WebhookCreate): Promise<WebhookRow> {
    const secret = crypto.randomUUID();
    return this.repo.create(workspaceId, input.url, input.events, secret);
  }

  async deliveries(webhookId: string) {
    return this.repo.listDeliveries(webhookId);
  }

  async remove(webhookId: string): Promise<void> {
    await this.repo.delete(webhookId);
  }

  async deliver(webhookId: string, event: string, payload: unknown): Promise<void> {
    const hook = await this.repo.get(webhookId);
    if (!hook) return;
    const body = { event, summary: summariseFindings(payload), payload };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await this.http.post(hook.url, body, {
        timeoutMs: DELIVERY_TIMEOUT_MS,
        headers: { 'x-devdigest-event': event, 'x-devdigest-signature': sign(hook.secret, body) },
      });
      await this.repo.recordDelivery(webhookId, event, res.status, attempt);
      if (res.status < 500) return;
    }
  }
}

function sign(secret: string, payload: unknown): string {
  return `sha256=${Buffer.from(`${secret}:${JSON.stringify(payload)}`).toString('base64')}`;
}
