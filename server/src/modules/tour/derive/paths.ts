/**
 * Path folding shared by the tree (R2's `tree[]`) and the diagram (R2's
 * `diagram`) — pure, no imports.
 *
 * These two MUST fold identically. They did not: `tree.ts` folded to the
 * depth-3 ancestor per Q7 while `diagram.ts` kept each file's immediate parent
 * at whatever depth it happened to be, so a real generation against a 512-file
 * repo drew **116 nodes and 250 edges** with labels like
 * `client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab`.
 * Unreadable, and not the summary R2 asks for. Two private `dirOf`s in two
 * files is how that happened, so there is now one of each here.
 */

/** The directory holding `path`, or `''` for a root-level file. */
export function dirOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/** The depth-3 ancestor of a directory (Q7). `a/b/c/d/e` → `a/b/c`. */
export function depth3Ancestor(dir: string): string {
  if (dir === '') return '';
  const segments = dir.split('/');
  return segments.length <= 3 ? dir : segments.slice(0, 3).join('/');
}

/** The depth-3 ancestor of the directory holding `path`, `'(root)'` for a
 *  root-level file — the diagram's node key. */
export function diagramNodeKey(path: string): string {
  return depth3Ancestor(dirOf(path)) || '(root)';
}
