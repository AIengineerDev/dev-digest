import { GithubClient } from '../adapters/github/client.js';
import { MailerClient } from '../adapters/mailer/client.js';

export interface Container {
  github: GithubClient;
  mailer: MailerClient;
}

export function buildContainer(env: Record<string, string>): Container {
  return {
    github: new GithubClient(env.GITHUB_TOKEN ?? ''),
    mailer: new MailerClient(env.MAILER_API_KEY ?? ''),
  };
}
