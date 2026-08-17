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

/**
 * Pull a repo and/or a PR number out of a pasted URL.
 *
 * Both URLs a person actually has in hand are accepted: the GitHub PR page
 * (which carries owner, repo AND number, so nothing else is needed) and the
 * DevDigest studio page (which carries the repo uuid and the number). Parsing
 * them costs nothing in the tool schema — the parameter is a string either way
 * — and not parsing them means the one value already on the clipboard is the
 * one value the tool rejects.
 */
const GITHUB_PR_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i;
const STUDIO_PR_RE = /\/repos\/([0-9a-f-]{36})\/pulls\/(\d+)/i;
const GITHUB_REPO_RE = /github\.com\/([^/\s]+)\/([^/\s?#]+)/i;
const STUDIO_REPO_RE = /\/repos\/([0-9a-f-]{36})/i;

/** `{repo, number}` from a PR URL, or null when the value is not one. */
export function parsePrUrl(value: string): { repo: string; number: number } | null {
  const v = value.trim();
  const gh = GITHUB_PR_RE.exec(v);
  // `.git` and a trailing slash are both common in copied remotes.
  if (gh) return { repo: `${gh[1]}/${gh[2]!.replace(/\.git$/, '')}`, number: Number(gh[3]) };
  const studio = STUDIO_PR_RE.exec(v);
  if (studio) return { repo: studio[1]!, number: Number(studio[2]) };
  return null;
}

/** A repo identifier from a repo or PR URL, or null. */
export function parseRepoUrl(value: string): string | null {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v) && !/^github\.com/i.test(v)) return null;
  const studio = STUDIO_REPO_RE.exec(v);
  if (studio) return studio[1]!;
  const gh = GITHUB_REPO_RE.exec(v);
  if (gh) return `${gh[1]}/${gh[2]!.replace(/\.git$/, '')}`;
  return null;
}

export interface Resolver {
  repoId(repo: string): Promise<string>;
  /** `pr` is a PR number or a pull-request uuid, always as a string; `repo` may
   *  be omitted for a uuid. */
  prId(repo: string | undefined, pr: string): Promise<{ repoId: string; prId: string }>;
}

export function createResolver(api: DevDigestApi): Resolver {
  const repoIds = new Map<string, string>();
  const prIds = new Map<string, string>();

  /**
   * A field the user typed into and then cleared arrives as `""` or `"  "`,
   * not as absent — hosts send the empty string. Treating that as a real repo
   * name produced `No imported repo matches "  "`, which reads as "your repo is
   * wrong" when the actual state is "you did not give one".
   */
  const blank = (v: string | undefined): boolean => v === undefined || v.trim() === '';

  async function repoId(repo: string): Promise<string> {
    if (blank(repo)) {
      throw new ApiError('`repo` is empty. Pass owner/name, the repo uuid, or a repo URL.');
    }
    // A uuid is already the answer. Not verified against the API first: the
    // caller's next request will 404 with the id in the message, which says the
    // same thing at no extra round trip.
    const uuid = asUuid(repo);
    if (uuid) return uuid;

    // A pasted repo or PR URL resolves to whichever identifier it carries.
    const fromUrl = parseRepoUrl(repo);
    if (fromUrl) return asUuid(fromUrl) ? fromUrl : repoId(fromUrl);

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
    pr: string,
  ): Promise<{ repoId: string; prId: string }> {
    // A pull-request uuid identifies the PR on its own — `repo` is then
    // redundant, and demanding it would make the id-driven path harder than the
    // name-driven one it exists to simplify. `repoId` is returned empty because
    // no caller needs it on this path; the one that does passes a name.
    const uuid = asUuid(pr);
    if (uuid) return { repoId: blank(repo) ? '' : await repoId(repo!), prId: uuid };

    // `pr` is a STRING even when it holds a number, so that the tool schema
    // stays `type: "string"` rather than `anyOf: [integer, string]`. See the
    // note on the schema in `tools/*.ts`.
    // A pasted PR URL carries the repo as well as the number, so it needs no
    // `repo` argument — and when one is supplied anyway the URL wins, because it
    // is the more specific of the two and disagreeing silently would review the
    // wrong pull request.
    const url = parsePrUrl(pr);
    const trimmed = pr.trim();
    // Normalise a cleared field to "absent" before it is used as a lookup key.
    const repoArg = blank(repo) ? undefined : repo;
    if (!url && !/^\d+$/.test(trimmed)) {
      throw new ApiError(
        `"${pr}" is not a PR number, a pull-request id, or a PR URL. Pass "482", ` +
          'the uuid from the studio URL, or paste the GitHub PR link.',
      );
    }
    const number = url ? url.number : Number(trimmed);
    const repoRef = url ? url.repo : repoArg;

    if (repoRef === undefined) {
      throw new ApiError('Pass `repo` (owner/name) alongside a PR number, or pass the PR URL / pull-request uuid as `pr`.');
    }

    const rid = await repoId(repoRef);
    const key = `${rid}#${number}`;
    const cached = prIds.get(key);
    if (cached) return { repoId: rid, prId: cached };

    const pulls = await api.listPulls(rid);
    const match = pulls.find((p) => p.number === number);
    if (!match?.id) {
      // `PrMeta.id` is nullish by contract: a PR seen on GitHub but not yet
      // persisted has no local id, and neither case is actionable differently.
      const capped = pulls.slice(0, 20);
      const known = [capped.map((p) => `#${p.number}`).join(' '), ...more(pulls.length, capped.length)]
        .filter(Boolean)
        .join(' ');
      throw new ApiError(
        `PR #${number} is not imported for ${repoRef}. Imported: ${known || '(none)'}`,
      );
    }
    prIds.set(key, match.id);
    return { repoId: rid, prId: match.id };
  }

  return { repoId, prId };
}
