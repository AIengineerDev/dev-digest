import type { ProjectContextDoc, Repo } from "@devdigest/shared";

/** Pure helpers for the Project Context screen. No React. */

export interface DocGroup {
  /** Repo-relative directory, "" for documents at the repo root. */
  dir: string;
  docs: ProjectContextDoc[];
}

/**
 * Group documents by their containing directory and sort both the groups and
 * the documents within each group. Full repo-relative paths are shown on every
 * row regardless of grouping (spec C3) — grouping only changes ordering, never
 * what a row displays, since two documents can share a basename in different
 * directories.
 */
export function groupByDirectory(docs: ProjectContextDoc[]): DocGroup[] {
  const byDir = new Map<string, ProjectContextDoc[]>();
  for (const doc of docs) {
    const dir = dirOf(doc.path);
    const list = byDir.get(dir) ?? [];
    list.push(doc);
    byDir.set(dir, list);
  }
  const groups = [...byDir.entries()]
    .map(([dir, groupDocs]) => ({
      dir,
      docs: [...groupDocs].sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
  return groups;
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Case-insensitive substring filter over the full repo-relative path. */
export function filterDocs(docs: ProjectContextDoc[], query: string): ProjectContextDoc[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) => d.path.toLowerCase().includes(q));
}

/**
 * A repo whose clone has not landed yet (`clone_path` is `null`) is a
 * different fact from "this repo genuinely has zero Markdown documents"
 * (spec C1 vs C2) — the mock draws them identically, which is the gap R1/R9
 * exist to close.
 */
export function isRepoIndexing(repo: Pick<Repo, "clone_path"> | undefined | null): boolean {
  return !repo || repo.clone_path == null;
}

/** Genuinely empty: the clone exists and discovery found nothing (spec C2). */
export function isGenuinelyEmpty(
  repo: Pick<Repo, "clone_path"> | undefined | null,
  docs: ProjectContextDoc[],
): boolean {
  return !isRepoIndexing(repo) && docs.length === 0;
}

/** Whether a row's attach toggle should be disabled and struck through (C4). */
export function isUnattachable(doc: Pick<ProjectContextDoc, "too_large" | "missing">): boolean {
  return doc.too_large || doc.missing;
}
