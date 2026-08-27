/**
 * Architecture diagram derivation (R2, C4, C10) — pure. Renders a mermaid
 * `flowchart LR` string DIRECTLY from `file_edges`, aggregated to **depth-3**
 * directory pairs (Q7) — the same fold `tree.ts` applies, through the same
 * helper, because the two drifting is exactly what produced a 116-node
 * hairball on the first real generation. The model never writes this field (T4.2) — the whole point of
 * moving it here is that a diagram nobody grounded is no longer possible.
 *
 * Mermaid rules mirrored from `onboarding.system.md:35-42`: every node label
 * quoted, no CR/LF or backticks inside a label, no diagram at all (`null`,
 * never `''`) when there is nothing to draw.
 */
/** Structurally typed against the repo-intel facade's `FileEdgeRow` — same
 *  trick `modules/blast/helpers.ts`'s `BlastResultLike` uses, so this module
 *  never imports another module's files (`no-cross-module-internals`, which
 *  counts `import type` too: `tsPreCompilationDeps: true`). */
import { MAX_DIAGRAM_NODES } from '../constants.js';
import { diagramNodeKey } from './paths.js';

export interface FileEdgeLike {
  fromFile: string;
  toFile: string;
}

/** Strip CR/LF and backticks, mermaid's own "keep every label one line, no
 *  fences" rules (`onboarding.system.md:38-40`). */
function sanitiseLabel(label: string): string {
  return label.replace(/[\r\n`]+/g, ' ').trim();
}

function nodeId(index: number): string {
  return `n${index}`;
}

export function buildDiagram(edges: readonly FileEdgeLike[]): string | null {
  const degree = new Map<string, number>();
  const pairs = new Set<string>();
  for (const e of edges) {
    const from = diagramNodeKey(e.fromFile);
    const to = diagramNodeKey(e.toFile);
    degree.set(from, (degree.get(from) ?? 0) + 1);
    degree.set(to, (degree.get(to) ?? 0) + 1);
    if (from !== to) pairs.add(`${from}\u0000${to}`);
  }

  if (degree.size === 0) return null;

  // A summary, not a map. Past MAX_DIAGRAM_NODES the picture stops carrying
  // information, so keep the busiest nodes (ties broken by name, so the output
  // is deterministic) and drop every edge that loses an endpoint.
  const kept = new Set(
    [...degree.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_DIAGRAM_NODES)
      .map(([dir]) => dir),
  );

  const sortedDirs = [...kept].sort();
  const ids = new Map<string, string>(sortedDirs.map((d, i) => [d, nodeId(i)]));

  const lines: string[] = ['flowchart LR'];
  for (const d of sortedDirs) {
    lines.push(`  ${ids.get(d)}["${sanitiseLabel(d)}"]`);
  }
  for (const pair of [...pairs].sort()) {
    const [from, to] = pair.split('\u0000');
    if (!kept.has(from!) || !kept.has(to!)) continue;
    lines.push(`  ${ids.get(from!)} --> ${ids.get(to!)}`);
  }

  return lines.join('\n');
}
