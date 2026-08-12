import type { IntentSource } from "@devdigest/shared";

/**
 * Pure helpers over `PrIntentRecord.sources` — no i18n, no fetch. The
 * component composes the translated strings from what these return.
 */

/** Documentation-grade sources that were actually used — the "why" list. */
export function usedDocumentationSources(sources: IntentSource[]): IntentSource[] {
  return sources.filter((s) => s.grade === "documentation" && s.used);
}

/** Every source that was NOT used, with its note — shown so a wrong intent is diagnosable. */
export function unusedSources(sources: IntentSource[]): IntentSource[] {
  return sources.filter((s) => !s.used);
}

/** The `commit_subjects` source's count (carried in `ref`), for the indirect-only "why" line. */
export function commitSubjectCount(sources: IntentSource[]): number {
  const ref = sources.find((s) => s.kind === "commit_subjects")?.ref;
  return ref ? Number(ref) || 0 : 0;
}
