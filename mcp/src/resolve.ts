/**
 * Names in, uuids out.
 *
 * Tools take `repo: "acme/payments-api"` and `pr: 482` because that is what the
 * model can see in a checkout; the HTTP API takes uuids. This is the one place
 * that bridges the two.
 *
 * Only *successful* lookups are memoised, and only for the life of the process:
 * a repo id never changes, but "not imported yet" is a state the user can fix
 * while the session is open, so caching a miss would strand them.
 */
import type { DevDigestApi } from './api.js';
import { ApiError } from './api.js';
import { more } from './format.js';

export interface Resolver {
  repoId(repo: string): Promise<string>;
  prId(repo: string, pr: number): Promise<{ repoId: string; prId: string }>;
}

export function createResolver(api: DevDigestApi): Resolver {
  const repoIds = new Map<string, string>();
  const prIds = new Map<string, string>();

  async function repoId(repo: string): Promise<string> {
    const key = repo.toLowerCase();
    const cached = repoIds.get(key);
    if (cached) return cached;

    const repos = await api.listRepos();
    // `owner/name` is the documented form; a bare name is accepted when it is
    // unambiguous, because that is what people type.
    const byFullName = repos.filter((r) => r.full_name.toLowerCase() === key);
    const matches = byFullName.length > 0 ? byFullName : repos.filter((r) => r.name.toLowerCase() === key);

    if (matches.length === 0) {
      throw new ApiError(
        `No imported repo matches "${repo}". Imported: ${
          repos.length > 0 ? repos.map((r) => r.full_name).join(', ') : '(none — add one in DevDigest first)'
        }`,
      );
    }
    if (matches.length > 1) {
      throw new ApiError(
        `"${repo}" is ambiguous — use the full owner/name: ${matches.map((r) => r.full_name).join(', ')}`,
      );
    }
    const id = matches[0]!.id;
    repoIds.set(key, id);
    return id;
  }

  async function prId(repo: string, pr: number): Promise<{ repoId: string; prId: string }> {
    const rid = await repoId(repo);
    const key = `${rid}#${pr}`;
    const cached = prIds.get(key);
    if (cached) return { repoId: rid, prId: cached };

    const pulls = await api.listPulls(rid);
    const match = pulls.find((p) => p.number === pr);
    if (!match?.id) {
      // `PrMeta.id` is nullish by contract: a PR seen on GitHub but not yet
      // persisted has no local id, and neither case is actionable differently.
      const capped = pulls.slice(0, 20);
      const known = [capped.map((p) => `#${p.number}`).join(' '), ...more(pulls.length, capped.length)]
        .filter(Boolean)
        .join(' ');
      throw new ApiError(
        `PR #${pr} is not imported for ${repo}. Imported: ${known || '(none)'}`,
      );
    }
    prIds.set(key, match.id);
    return { repoId: rid, prId: match.id };
  }

  return { repoId, prId };
}
