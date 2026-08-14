/**
 * Names in, uuids out — and uuids in, uuids out.
 *
 * Tools take `repo: "acme/payments-api"` and `pr: 482` because that is what the
 * model can see in a checkout; the HTTP API takes uuids. This is the one place
 * that bridges the two.
 *
 * A raw uuid is also accepted wherever a name is, and short-circuits the lookup.
 * That is not redundancy: a person driving the MCP Inspector by hand copies ids
 * out of the DevDigest studio URL, and rejecting them would make the tools
 * unusable in exactly the setting they are first tried in. It costs nothing in
 * the tool schema — the parameter is a string either way.
 *
 * Only *successful* lookups are memoised, and only for the life of the process:
 * a repo id never changes, but "not imported yet" is a state the user can fix
 * while the session is open, so caching a miss would strand them.
 */
import type { DevDigestApi } from './api.js';
import { ApiError } from './api.js';
import { more } from './format.js';

/**
 * Canonical uuid form, trimmed. The trim is load-bearing, not politeness: a
 * value pasted out of a browser address bar routinely carries whitespace, and a
 * near-miss uuid otherwise falls through to the name path and reports "no repo
 * matches", which sends the reader looking in the wrong place.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function asUuid(value: string): string | null {
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export interface Resolver {
  repoId(repo: string): Promise<string>;
  /** `pr` is a PR number, or a pull-request uuid; `repo` may be omitted for a uuid. */
  prId(repo: string | undefined, pr: number | string): Promise<{ repoId: string; prId: string }>;
}

export function createResolver(api: DevDigestApi): Resolver {
  const repoIds = new Map<string, string>();
  const prIds = new Map<string, string>();

  async function repoId(repo: string): Promise<string> {
    // A uuid is already the answer. Not verified against the API first: the
    // caller's next request will 404 with the id in the message, which says the
    // same thing at no extra round trip.
    const uuid = asUuid(repo);
    if (uuid) return uuid;

    const key = repo.trim().toLowerCase();
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

  async function prId(
    repo: string | undefined,
    pr: number | string,
  ): Promise<{ repoId: string; prId: string }> {
    // A pull-request uuid identifies the PR on its own — `repo` is then
    // redundant, and demanding it would make the id-driven path harder than the
    // name-driven one it exists to simplify. `repoId` is returned empty because
    // no caller needs it on this path; the one that does passes a name.
    if (typeof pr === 'string') {
      const uuid = asUuid(pr);
      if (uuid) return { repoId: repo ? await repoId(repo) : '', prId: uuid };
      throw new ApiError(
        `"${pr}" is neither a PR number nor a pull-request id. Pass the number (e.g. 482), ` +
          'or the uuid from the DevDigest URL /pulls/<number> page.',
      );
    }

    if (repo === undefined) {
      throw new ApiError('Pass `repo` (owner/name) alongside a PR number, or pass the pull-request uuid as `pr`.');
    }

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
