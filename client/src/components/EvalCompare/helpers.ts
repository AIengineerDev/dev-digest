export interface DiffLine {
  kind: "add" | "del" | "same";
  text: string;
}

/**
 * Line diff between two prompt snapshots.
 *
 * Deliberately naive — a set difference, not an LCS: the question this answers
 * is "which instructions changed between these two runs", and for a prompt of a
 * few dozen lines that is the same answer with none of the machinery.
 *
 * Returns null when either run stored no prompt, and an EMPTY array when the
 * two are identical. Those are different answers — "we cannot tell" is not
 * "nothing changed" — and the caller renders them differently.
 */
export function diffLines(a: string | null, b: string | null): DiffLine[] | null {
  if (a === null || b === null) return null;
  if (a === b) return [];
  const before = a.split("\n");
  const after = b.split("\n");
  const removed = new Set(before.filter((l) => !after.includes(l)));
  const added = new Set(after.filter((l) => !before.includes(l)));
  const out: DiffLine[] = [];
  for (const line of before) if (removed.has(line)) out.push({ kind: "del", text: line });
  for (const line of after) out.push({ kind: added.has(line) ? "add" : "same", text: line });
  return out;
}
