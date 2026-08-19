/**
 * project-context discovery — filesystem walk over a clone directory for
 * `.md`/`.markdown` documents (specs/09-project-context.md R1).
 *
 * A local `readdir` recursion, not repo-intel's walk: `.md` is deliberately
 * outside `SUPPORTED_EXT` (repo-intel/constants.ts), and `no-cross-module-
 * internals` forbids importing repo-intel's walk directly. Copies its two hard
 * rules — never follow symlinks, honour the shared excluded-dir set — from
 * `repo-intel/pipeline/walk.ts:89-101`.
 *
 * Unlike that walk, an oversized document is NOT dropped: it is listed with
 * `tooLarge: true` so the UI can say "too large to attach" (spec C4) rather
 * than silently omitting it.
 */
import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { EXCLUDED_DIRS, MAX_FILE_SIZE } from '../_shared/walk-limits.js';
import { DOC_EXTENSIONS, MAX_DOCUMENTS } from './constants.js';

const EXCLUDED_SET: ReadonlySet<string> = new Set(EXCLUDED_DIRS);
const EXT_SET: ReadonlySet<string> = new Set(DOC_EXTENSIONS);

export interface DiscoveredDoc {
  /** Repo-relative, forward-slash-normalised. */
  path: string;
  size: number;
  tooLarge: boolean;
}

export interface DiscoveryResult {
  docs: DiscoveredDoc[];
  /** True when discovery hit `MAX_DOCUMENTS` and stopped (spec C3). */
  truncated: boolean;
}

/** Recursively walk `root`, returning every `.md`/`.markdown` file found. */
export async function discoverDocuments(root: string): Promise<DiscoveryResult> {
  const out: DiscoveredDoc[] = [];
  await walkDir(root, root, out);

  // Stable order: alphabetical relpath, same rationale as repo-intel's walk —
  // "first N when truncated" stays reproducible across runs.
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  let truncated = false;
  if (out.length > MAX_DOCUMENTS) {
    truncated = true;
    out.length = MAX_DOCUMENTS;
  }

  return { docs: out, truncated };
}

async function walkDir(root: string, dir: string, out: DiscoveredDoc[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Unreadable directory (permissions, clone not present yet) — skip
    // cleanly so discovery keeps making progress on what it CAN read.
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks (loops, escape)
    const name = entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDED_SET.has(name)) continue;
      await walkDir(root, join(dir, name), out);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(name).toLowerCase();
    if (!EXT_SET.has(ext)) continue;

    const full = join(dir, name);
    let size: number;
    try {
      size = (await stat(full)).size;
    } catch {
      continue;
    }

    const rel = relative(root, full).split(sep).join('/');
    out.push({ path: rel, size, tooLarge: size > MAX_FILE_SIZE });
  }
}
