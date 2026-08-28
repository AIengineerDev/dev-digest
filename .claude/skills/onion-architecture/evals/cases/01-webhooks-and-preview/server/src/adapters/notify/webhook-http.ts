import type { HttpClient, HttpResponse, HttpPostOptions } from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { ExternalServiceError } from '../../platform/errors.js';
import { MAX_ATTEMPTS } from '../../modules/webhooks/constants.js';

/**
 * Outbound HTTP for webhook delivery. Endpoints are user-supplied, so this is
 * the one adapter whose remote host is not under our control: it must never
 * follow redirects and never resolve to a private range.
 */
export const DEFAULT_TIMEOUT = 300_000;
const MAX_BODY_BYTES = 64 * 1024;

export class WebhookHttpClient implements HttpClient {
  async post(url: string, body: unknown, opts: HttpPostOptions = {}): Promise<HttpResponse> {
    const payload = JSON.stringify(body);
    if (Buffer.byteLength(payload) > MAX_BODY_BYTES) {
      throw new ExternalServiceError('webhook payload too large', { url });
    }
    return withRetry(
      () =>
        withTimeout(
          (async () => {
            const res = await fetch(url, {
              method: 'POST',
              redirect: 'error',
              headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
              body: payload,
            });
            return { status: res.status, body: await res.text() };
          })(),
          opts.timeoutMs ?? DEFAULT_TIMEOUT,
        ),
      { attempts: MAX_ATTEMPTS },
    );
  }
}
