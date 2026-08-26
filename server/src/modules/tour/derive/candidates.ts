/**
 * First-tasks candidate derivation (R8) — pure over already-fetched inputs.
 * Four generators, ≤ 12 candidates total. `grep` is injected (same trick as
 * `assemble.ts`'s tokenizer, `config.ts`'s `readFile`) so this file imports
 * no adapter; the caller (`service.ts`) wraps it with its own timeout and
 * try/catch — a throw or an expiry here yields zero candidates from `grep`
 * alone, and the other three generators still run.
 */
import { classifyPath } from '../../_shared/file-roles.js';

export const MAX_CANDIDATES = 12;
export const MAX_SNIPPET_CHARS = 120;
/** `todo_marker`'s own timeout — independent of the other three generators,
 *  which never touch the code index at all. */
export const TODO_GREP_TIMEOUT_MS = 5_000;

export type CandidateKind = 'missing_test' | 'todo_marker' | 'unresolved_reference' | 'undocumented_endpoint';

export interface DerivedCandidate {
  candidate_id: string;
  kind: CandidateKind;
  /** The file/path this candidate scopes to — `derive/difficulty.ts`'s `P`
   *  input and `getBlastRadius`'s `changedFiles` argument key off this. */
  scope: string;
  line: number | null;
  snippet: string;
  /** Always `null` from this function — filled by `merge.ts` from
   *  `first_tasks[].why`, matched by `candidate_id`; `title` may be
   *  rewritten too, never invented (R8, C16). */
  why: null;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export interface CandidatesInput {
  /** Every indexed file — used to classify roles and find each core file's
   *  test-file counterpart. */
  allFiles: readonly string[];
  unresolvedRefs: readonly { refFile: string; refLine: number; symbolName: string }[];
  /** `file_facts` rows carrying at least one endpoint. */
  endpointFacts: readonly { filePath: string; endpoints: readonly string[] }[];
  /** Paths already mentioned (as a substring) inside a discovered document —
   *  computed by `service.ts` from `_shared/doc-discovery.ts` + `git.readFile`,
   *  best-effort. An endpoint's file NOT in this set is "undocumented". */
  documentedFiles: ReadonlySet<string>;
  grep: (pattern: string) => Promise<readonly GrepMatch[]>;
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/[\r\n]+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}

function testBaseNames(allFiles: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const f of allFiles) {
    const file = f.split('/').pop() ?? f;
    const match = /^(.*)\.(test|spec)\.[jt]sx?$/.exec(file);
    if (match) names.add(match[1]!);
  }
  return names;
}

function baseName(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.[jt]sx?$/, '');
}

function missingTestCandidates(allFiles: readonly string[]): DerivedCandidate[] {
  const tested = testBaseNames(allFiles);
  const out: DerivedCandidate[] = [];
  for (const f of allFiles) {
    if (classifyPath(f) !== 'core') continue;
    if (/\.(test|spec)\.[jt]sx?$/.test(f)) continue;
    if (tested.has(baseName(f))) continue;
    out.push({
      candidate_id: `missing_test_${f}`,
      kind: 'missing_test',
      scope: f,
      line: null,
      snippet: truncate(`${f} has no matching test file`, MAX_SNIPPET_CHARS),
      why: null,
    });
  }
  return out;
}

function unresolvedReferenceCandidates(
  refs: readonly { refFile: string; refLine: number; symbolName: string }[],
): DerivedCandidate[] {
  return refs.map((r) => ({
    candidate_id: `unresolved_reference_${r.refFile}_${r.refLine}_${r.symbolName}`,
    kind: 'unresolved_reference',
    scope: r.refFile,
    line: r.refLine,
    snippet: truncate(`${r.symbolName}(…) — unresolved at ${r.refFile}:${r.refLine}`, MAX_SNIPPET_CHARS),
    why: null,
  }));
}

function undocumentedEndpointCandidates(
  endpointFacts: readonly { filePath: string; endpoints: readonly string[] }[],
  documentedFiles: ReadonlySet<string>,
): DerivedCandidate[] {
  const out: DerivedCandidate[] = [];
  for (const fact of endpointFacts) {
    if (documentedFiles.has(fact.filePath)) continue;
    for (const endpoint of fact.endpoints) {
      out.push({
        candidate_id: `undocumented_endpoint_${fact.filePath}_${endpoint}`,
        kind: 'undocumented_endpoint',
        scope: fact.filePath,
        line: null,
        snippet: truncate(`${endpoint} — declared in ${fact.filePath}, not named in any discovered doc`, MAX_SNIPPET_CHARS),
        why: null,
      });
    }
  }
  return out;
}

function todoMarkerCandidates(matches: readonly GrepMatch[]): DerivedCandidate[] {
  return matches.map((m) => ({
    candidate_id: `todo_marker_${m.path}_${m.line}`,
    kind: 'todo_marker',
    scope: m.path,
    line: m.line,
    snippet: truncate(m.text, MAX_SNIPPET_CHARS),
    why: null,
  }));
}

export async function buildCandidates(input: CandidatesInput): Promise<DerivedCandidate[]> {
  let todoMatches: readonly GrepMatch[] = [];
  try {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('todo_marker grep timed out')), TODO_GREP_TIMEOUT_MS);
    });
    todoMatches = await Promise.race([input.grep('TODO|FIXME|HACK'), timeout]);
  } catch {
    todoMatches = []; // a throw or timeout here is zero candidates from THIS generator only
  }

  const all = [
    ...missingTestCandidates(input.allFiles),
    ...todoMarkerCandidates(todoMatches),
    ...unresolvedReferenceCandidates(input.unresolvedRefs),
    ...undocumentedEndpointCandidates(input.endpointFacts, input.documentedFiles),
  ];

  return all.slice(0, MAX_CANDIDATES);
}
