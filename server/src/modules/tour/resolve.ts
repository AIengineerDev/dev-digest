/**
 * Read-time re-resolution (R11) — pure. Runs on EVERY `GET`: one
 * `getIndexedFiles` call plus a set-membership pass over the persisted
 * record, never persisted itself. Persisting resolution at write time is
 * exactly what R11 exists to prevent — a file can disappear from the index
 * (deleted, renamed, moved outside `SUPPORTED_EXT`) long after the tour was
 * generated, and the record must say so without a regeneration.
 */
import { normalizePath } from '../_shared/file-roles.js';
import type { OnboardingSection } from '@devdigest/shared';

export function resolveSections(
  sections: readonly OnboardingSection[],
  currentIndexedFiles: readonly string[],
): OnboardingSection[] {
  const indexed = new Set(currentIndexedFiles.map(normalizePath));
  const isResolved = (path: string): boolean => indexed.has(normalizePath(path));

  return sections.map((s): OnboardingSection => {
    if (s.kind === 'critical_paths' && s.paths) {
      return { ...s, paths: s.paths.map((p) => ({ ...p, resolved: p.files.map(isResolved) })) };
    }
    if (s.kind === 'guided_reading' && s.reading) {
      return { ...s, reading: s.reading.map((r) => ({ ...r, resolved: isResolved(r.path) })) };
    }
    if (s.kind === 'first_tasks' && s.tasks) {
      return { ...s, tasks: s.tasks.map((t) => ({ ...t, resolved: isResolved(t.scope) })) };
    }
    return s;
  });
}
