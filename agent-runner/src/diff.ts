import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { UnifiedDiff, DiffHunk } from '@devdigest/shared';

const execFileAsync = promisify(execFile);

/**
 * Minimal unified-diff parser — ported line-for-line from
 * `server/src/adapters/git/diff-parser.ts:14` (R9: the runner computes its
 * own diff and must not import server internals). Extracts per-file hunks
 * and the set of new-side line numbers each hunk covers, exactly what the
 * citation-grounding gate needs (file:line must intersect a real hunk). Any
 * change here must be mirrored there and vice versa — see
 * `plans/15-export-to-ci.plan.md` Recommendation 2 (a follow-up to
 * consolidate both copies into `reviewer-core`).
 *
 * Handles standard `git diff` output:
 *   diff --git a/path b/path
 *   --- a/path
 *   +++ b/path
 *   @@ -oldStart,oldLines +newStart,newLines @@
 */
export function parseUnifiedDiff(raw: string): UnifiedDiff {
  const files: UnifiedDiff['files'] = [];
  const lines = raw.split('\n');

  let current: UnifiedDiff['files'][number] | null = null;
  let hunk: DiffHunk | null = null;
  let newLineCursor = 0;

  const flushHunk = () => {
    if (current && hunk) current.hunks.push(hunk);
    hunk = null;
  };
  const flushFile = () => {
    flushHunk();
    if (current) files.push(current);
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      flushFile();
      // path resolved from +++ line below; placeholder for now
      current = { path: '', additions: 0, deletions: 0, hunks: [] };
      continue;
    }
    if (line.startsWith('+++ ')) {
      if (!current) current = { path: '', additions: 0, deletions: 0, hunks: [] };
      const p = line.slice(4).replace(/^b\//, '').trim();
      current.path = p === '/dev/null' ? current.path : p;
      continue;
    }
    if (line.startsWith('--- ')) continue;
    const hh = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hh) {
      flushHunk();
      const newStart = Number(hh[3]);
      const newLines = hh[4] ? Number(hh[4]) : 1;
      hunk = {
        file: current?.path ?? '',
        oldStart: Number(hh[1]),
        oldLines: hh[2] ? Number(hh[2]) : 1,
        newStart,
        newLines,
        newLineNumbers: [],
      };
      newLineCursor = newStart;
      continue;
    }
    if (!current || !hunk) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions++;
      hunk.newLineNumbers.push(newLineCursor);
      newLineCursor++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletions++;
      // deletion: no new-side line consumed
    } else {
      // context line: advances new-side cursor and counts as covered
      hunk.newLineNumbers.push(newLineCursor);
      newLineCursor++;
    }
  }
  flushFile();

  return { raw, files: files.filter((f) => f.path) };
}

/**
 * Compute `git diff <base>...<head>` in `cwd` and return the parsed
 * `UnifiedDiff`. Runs `git` via `execFile` with an **argument array** —
 * never a shell string — so a branch name containing `$(id)` or backticks is
 * inert (C11): it is passed to `git` as one literal argv entry, never
 * interpreted by a shell.
 *
 * An empty diff (e.g. a shallow checkout missing `head`, the failure mode
 * recorded in `server/INSIGHTS.md:288-294`) is returned as-is — `files: []`
 * — rather than thrown. The caller (not this module) decides what an empty
 * diff means; C9 requires it to be logged as "no reviewable diff", never as
 * a clean review.
 */
export async function computeDiff(base: string, head: string, cwd: string): Promise<UnifiedDiff> {
  const { stdout } = await execFileAsync('git', ['diff', `${base}...${head}`], {
    cwd,
    maxBuffer: 1024 * 1024 * 64,
  });
  return parseUnifiedDiff(stdout);
}
