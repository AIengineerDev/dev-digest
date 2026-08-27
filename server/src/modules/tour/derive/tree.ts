/**
 * Directory tree derivation (R2, Q7) — pure. Groups indexed files by their
 * directory prefix to depth 3, folding anything deeper into its depth-3
 * ancestor's count. `note` is ALWAYS `null` here (R24 — the derive layer
 * never writes prose); a folded subdirectory's name is carried on `folded`
 * instead, a fact `assemble.ts` (A3) hands the model as input so it can
 * WRITE a note about it (`architecture.dirs[].note`, matched back onto this
 * entry by `path` at merge time, `merge.ts`). No `Container`, no `Db`, no
 * adapter import — a pure function over values.
 */
import { classifyPath } from '../../_shared/file-roles.js';
import { depth3Ancestor, dirOf } from './paths.js';

/** Directories with more entries than this are dropped, keeping the biggest
 *  first — a huge monorepo must not blow past a renderable tree (A2.1 cap). */
export const MAX_TREE_DIRS = 200;

export interface TreeFileInput {
  path: string;
  /** `file_rank.percentile`, or `null` when this file has no rank row. */
  percentile: number | null;
}

export interface DerivedTreeEntry {
  path: string;
  files: number;
  role_mix: Record<string, number>;
  top_file: string | null;
  /** Always `null` from this function — see file header. */
  note: null;
  /** Depth-3-and-deeper subdirectory names folded into this entry's count,
   *  e.g. `['derive', 'test-fixtures']`. Not part of the wire contract —
   *  `assemble.ts` reads it to give the model something concrete to write
   *  `note` about; `skeleton.ts` drops it when projecting to the contract
   *  shape. */
  folded: string[];
}

/** The depth-3 ancestor of a directory, and the folded remainder (if any).
 *  The ancestor comes from the SHARED `depth3Ancestor` so the tree and the
 *  diagram cannot fold differently — they did once, see `paths.ts`. */
function depth3Split(dir: string): { ancestor: string; foldedSegment: string | null } {
  if (dir === '') return { ancestor: '', foldedSegment: null };
  const segments = dir.split('/');
  return {
    ancestor: depth3Ancestor(dir),
    foldedSegment: segments.length <= 3 ? null : (segments[3] ?? null),
  };
}

export function buildTree(files: readonly TreeFileInput[]): DerivedTreeEntry[] {
  interface Acc {
    files: number;
    roleMix: Record<string, number>;
    topFile: string | null;
    topPercentile: number;
    folded: Set<string>;
  }
  const byDir = new Map<string, Acc>();

  for (const f of files) {
    const dir = dirOf(f.path);
    const { ancestor, foldedSegment } = depth3Split(dir);
    let acc = byDir.get(ancestor);
    if (!acc) {
      acc = { files: 0, roleMix: {}, topFile: null, topPercentile: -1, folded: new Set() };
      byDir.set(ancestor, acc);
    }
    acc.files += 1;
    const role = classifyPath(f.path);
    acc.roleMix[role] = (acc.roleMix[role] ?? 0) + 1;
    if (foldedSegment) acc.folded.add(foldedSegment);
    const p = f.percentile ?? -1;
    if (p > acc.topPercentile) {
      acc.topPercentile = p;
      acc.topFile = f.path;
    }
  }

  const entries: DerivedTreeEntry[] = [...byDir.entries()].map(([path, acc]) => ({
    path,
    files: acc.files,
    role_mix: acc.roleMix,
    top_file: acc.topFile,
    note: null,
    folded: [...acc.folded].sort(),
  }));

  // Biggest directories first, so a truncation to MAX_TREE_DIRS keeps the
  // ones that matter most to a first-day read.
  entries.sort((a, b) => b.files - a.files || a.path.localeCompare(b.path));
  return entries.slice(0, MAX_TREE_DIRS);
}
