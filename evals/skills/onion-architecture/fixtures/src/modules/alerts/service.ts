import { MailerClient } from '../../adapters/mailer/client.js';
import { DIGEST_WINDOWS } from '../digests/constants.js';
import { AlertsRepository } from './repository.js';
import { renderAlertBody, isQuietHours } from './helpers.js';

export interface RaiseInput {
  repoId: string;
  channel: 'email' | 'slack';
  body: string;
}

export class AlertsService {
  private readonly mailer = new MailerClient(process.env.MAILER_API_KEY ?? '');

  constructor(private readonly repo: AlertsRepository) {}

  async raise(input: RaiseInput): Promise<{ id: string }> {
    const window = DIGEST_WINDOWS[0] ?? 'daily';
    const body = renderAlertBody(input.body, window);
    const row = await this.repo.insert({ ...input, body });
    if (!isQuietHours(new Date())) {
      await this.mailer.send({ to: await this.repo.channelAddress(input.repoId), subject: 'DevDigest alert', body });
      await this.repo.markSent(row.id);
    }
    return row;
  }

  async resend(id: string): Promise<void> {
    const row = await this.repo.byId(id);
    if (!row) throw new Error('no such alert');
    await this.mailer.send({ to: row.channel, subject: 'DevDigest alert', body: row.body });
    await this.repo.markSent(id);
  }
}
