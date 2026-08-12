/**
 * Intent signal collection (specs/04-intent-layer.md, §1 Data sources).
 *
 * Code only, no model call. I/O only through `container.github()` /
 * `container.git` — same discipline as `conventions/service.ts`'s `sample()`.
 * Every source is best-effort: a per-source `.catch()` turns a failure into
 * `used:false` + a note, and the whole step is time-boxed so a slow GitHub call
 * cannot blow the run's budget.
 */
import { createHash } from 'node:crypto';
import type { Container } from '../../platform/container.js';
import type { IntentSource, RepoRef } from '@devdigest/shared';
import { withTimeout } from '../../platform/resilience.js';
import type { PullRow } from './repository.js';
import {
  DOC_ALLOWED_EXTENSIONS,
  MAX_COMMIT_SUBJECTS,
  MAX_COMMIT_SUBJECT_CHARS,
  MAX_DOCS,
  MAX_DOC_BYTES,
  SIGNAL_COLLECTION_BUDGET_MS,
} from './intent-constants.js';

export interface CollectedDoc {
  path: string;
  content: string;
}

export interface CollectedIssue {
  number: number;
  title: string;
  body: string;
}

export interface CollectedSignals {
  sources: IntentSource[];
  title: string;
  /** Empty string when the body is absent OR is only checklist boilerplate. */
  body: string;
  branch: string;
  commitSubjects: string[];
  changedPaths: string[];
  issue: CollectedIssue | null;
  docs: CollectedDoc[];
}

/** `closes #123` / `fixes #123` / `resolves #123` / bare `#123` — same pattern
 *  the GitHub adapter uses for `PrDetail.linked_issue` (octokit.ts:127). */
const ISSUE_REF_RE = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

/** In-repo doc reference: a relative path ending in an allowlisted extension,
 *  found either bare or inside a markdown link `[text](path)`. */
const DOC_REF_RE = /(?:\]\()?([./]?[\w./-]+\.(?:md|mdx|txt))\b/gi;

/** Hosts that are trackers we deliberately never fetch (§1: "never fetched"). */
const EXTERNAL_TRACKER_RE =
  /https?:\/\/(?:[\w-]+\.)?(?:atlassian\.net|jira\.[\w.-]+|linear\.app)\/\S+/i;

/** A body that is only checkbox/heading boilerplate counts as absent (§1). */
export function meaningfulBody(body: string | null | undefined): string {
  if (!body) return '';
  const stripped = body
    .split('\n')
    .filter((line) => !/^\s*[-*]\s*\[[ xX]?\]/.test(line)) // checklist items
    .filter((line) => !/^\s*#{1,6}\s*$/.test(line)) // bare headings
    .join('\n')
    .trim();
  return stripped.length < 20 ? '' : body.trim();
}

/** Reject `..`, absolute paths, and anything that isn't an allowlisted extension. */
export function isSafeDocPath(path: string): boolean {
  if (path.startsWith('/')) return false;
  if (path.includes('..')) return false;
  if (/^[a-z]+:\/\//i.test(path)) return false; // any URL (incl. outside-this-repo)
  return DOC_ALLOWED_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext));
}

/** Referenced-doc paths found in the body, deduped, capped at MAX_DOCS. */
export function referencedDocPaths(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(DOC_REF_RE)) {
    const path = m[1];
    if (path && isSafeDocPath(path)) found.add(path.replace(/^\.\//, ''));
    if (found.size >= MAX_DOCS) break;
  }
  return [...found].slice(0, MAX_DOCS);
}

export async function collectIntentSignals(
  container: Container,
  repoRef: RepoRef,
  pull: PullRow,
  commits: { message: string }[],
  changedPaths: string[],
): Promise<CollectedSignals> {
  const sources: IntentSource[] = [];
  const title = pull.title;
  const branch = pull.branch;
  const commitSubjects = commits
    .map((c) => c.message.split('\n')[0]!.slice(0, MAX_COMMIT_SUBJECT_CHARS))
    .slice(0, MAX_COMMIT_SUBJECTS);

  // ---- indirect signals — always available, no I/O ------------------------
  sources.push({ kind: 'title', grade: 'indirect', used: title.trim().length > 0 });
  sources.push({ kind: 'branch', grade: 'indirect', used: branch.trim().length > 0 });
  // `ref` carries the count for these two — the UI's "why" sentence names it
  // ("… and 7 commit subjects") without re-deriving it from elsewhere.
  sources.push({
    kind: 'commit_subjects',
    ref: String(commitSubjects.length),
    grade: 'indirect',
    used: commitSubjects.length > 0,
  });
  sources.push({
    kind: 'changed_paths',
    ref: String(changedPaths.length),
    grade: 'indirect',
    used: changedPaths.length > 0,
  });

  const body = meaningfulBody(pull.body);
  sources.push({
    kind: 'pr_body',
    grade: 'documentation',
    used: body.length > 0,
    ...(body.length === 0 ? { note: 'absent or checklist-only boilerplate' } : {}),
  });

  // External tracker reference: recorded as an unresolved source, never fetched.
  const rawBody = pull.body ?? '';
  if (EXTERNAL_TRACKER_RE.test(rawBody)) {
    const ref = rawBody.match(EXTERNAL_TRACKER_RE)?.[0];
    sources.push({
      kind: 'linked_issue',
      ref,
      grade: 'documentation',
      used: false,
      note: 'external tracker not readable',
    });
  }

  // ---- documentation-grade signals that need I/O — time-boxed as a whole --
  let issue: CollectedIssue | null = null;
  const docs: CollectedDoc[] = [];

  const work = (async () => {
    // Linked GitHub issue.
    const issueMatch = rawBody.match(ISSUE_REF_RE);
    if (issueMatch?.[1]) {
      const number = Number(issueMatch[1]);
      try {
        const gh = await container.github();
        const meta = await gh.getIssue(repoRef, number);
        issue = { number: meta.number, title: meta.title, body: meta.body ?? '' };
        sources.push({ kind: 'linked_issue', ref: `#${number}`, grade: 'documentation', used: true });
      } catch (err) {
        sources.push({
          kind: 'linked_issue',
          ref: `#${number}`,
          grade: 'documentation',
          used: false,
          note: `fails closed: ${(err as Error).message}`,
        });
      }
    }

    // Referenced in-repo spec/plan docs.
    for (const path of referencedDocPaths(rawBody)) {
      try {
        const content = await container.git.readFile(repoRef, path);
        docs.push({ path, content: content.slice(0, MAX_DOC_BYTES) });
        sources.push({ kind: 'referenced_doc', ref: path, grade: 'documentation', used: true });
      } catch (err) {
        sources.push({
          kind: 'referenced_doc',
          ref: path,
          grade: 'documentation',
          used: false,
          note: `unreadable: ${(err as Error).message}`,
        });
      }
    }
  })();

  try {
    await withTimeout(work, SIGNAL_COLLECTION_BUDGET_MS);
  } catch {
    // Budget exceeded — whatever resolved before the timeout is kept; anything
    // still in flight is simply absent from `sources`/`docs`/`issue` (never
    // recorded as used, which is the honest state).
  }

  return { sources, title, body, branch, commitSubjects, changedPaths, issue, docs };
}

/** sha256 of a doc/issue body, for the fingerprint (never the raw text — the
 *  fingerprint only needs to notice a change, not carry the content). */
export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
