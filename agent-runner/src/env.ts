import { readFileSync } from 'node:fs';
import type { Provider } from '@devdigest/shared';

/**
 * The GitHub Actions environment this runner executes in — read once at
 * startup. Nothing else in this package touches `process.env` directly, so a
 * missing variable surfaces as one clear error instead of an undefined
 * threading through several files.
 */
export interface CiEnv {
  githubToken: string;
  githubRepository: string;
  eventPath: string;
  baseRef: string;
  headRef: string;
}

export class MissingEnvError extends Error {
  constructor(public readonly name: string) {
    super(`${name} is not set — this runner must run inside a GitHub Actions job.`);
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new MissingEnvError(name);
  return v;
}

export function loadCiEnv(): CiEnv {
  return {
    githubToken: required('GITHUB_TOKEN'),
    githubRepository: required('GITHUB_REPOSITORY'),
    eventPath: required('GITHUB_EVENT_PATH'),
    baseRef: required('GITHUB_BASE_REF'),
    headRef: required('GITHUB_HEAD_REF'),
  };
}

/** Provider → the env var that carries its API key (mirrors settings/constants.ts's
 * SECRET_KEY_BY_PROVIDER on the server side, without importing server internals). */
const PROVIDER_KEY_ENV: Record<Provider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

export class MissingProviderKeyError extends Error {
  constructor(
    public readonly provider: Provider,
    public readonly envVar: string,
  ) {
    // Same message shape as server/src/modules/_shared/provider-errors.ts:5
    // ("<KEY> is not configured") — the message a reader would recognise
    // from the studio, even though this package cannot import that module.
    super(`${envVar} is not configured.`);
  }
}

/** Resolve the API key for `provider` from the environment, or throw. */
export function requireProviderKey(provider: Provider): string {
  const envVar = PROVIDER_KEY_ENV[provider];
  const value = process.env[envVar];
  if (!value) throw new MissingProviderKeyError(provider, envVar);
  return value;
}

/** Shape of the subset of the `pull_request` GitHub Actions event we read. */
interface PullRequestEvent {
  pull_request?: {
    head?: { repo?: { full_name?: string } };
  };
}

/**
 * True when the PR's head repo differs from the workflow's own repository —
 * i.e. this run was triggered by a fork PR, which GitHub does not hand
 * repository secrets to. Read from `GITHUB_EVENT_PATH`, never from a header
 * or a claim inside the diff (C10).
 */
export function isForkPr(eventPath: string, githubRepository: string): boolean {
  const raw = readFileSync(eventPath, 'utf8');
  const event = JSON.parse(raw) as PullRequestEvent;
  const headRepo = event.pull_request?.head?.repo?.full_name;
  return typeof headRepo === 'string' && headRepo !== githubRepository;
}
