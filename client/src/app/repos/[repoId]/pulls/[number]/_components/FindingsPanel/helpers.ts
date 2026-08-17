import type { FindingRecord } from "@devdigest/shared";
import {
  LOW_CONFIDENCE_THRESHOLD,
  SEVERITIES,
  SEVERITY_ORDER,
  type FilterableSeverity,
} from "./constants";

/** Which severities the list is currently showing. */
export type SeverityFilter = Record<FilterableSeverity, boolean>;

/** All severities on — the state the panel opens in. */
export function allSeveritiesOn(): SeverityFilter {
  return Object.fromEntries(SEVERITIES.map((sv) => [sv, true])) as SeverityFilter;
}

/**
 * Findings per severity, counted over the UNFILTERED list.
 *
 * Counting the filtered list instead would make a chip read "0" the moment you
 * switch it off, so you could no longer see what you'd be switching back on.
 * Seeded with every severity at 0 so a level with no findings still gets a chip
 * rather than silently disappearing from the toolbar.
 */
export function countBySeverity(findings: FindingRecord[]): Record<FilterableSeverity, number> {
  const counts = Object.fromEntries(SEVERITIES.map((sv) => [sv, 0])) as Record<
    FilterableSeverity,
    number
  >;
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as FilterableSeverity] += 1;
  }
  return counts;
}

/**
 * Keep a jumped-to finding visible whatever the filters say.
 *
 * Clicking its badge in Smart Diff is an explicit request for THAT card, so a
 * severity chip switched off — or "hide low confidence" — must not answer the
 * click with an empty list. It goes first because it is the reason the list is
 * being looked at; the rest keeps its severity order.
 */
export function withFocused(
  shown: FindingRecord[],
  all: FindingRecord[],
  focusFindingId: string | null | undefined,
): FindingRecord[] {
  if (!focusFindingId || shown.some((f) => f.id === focusFindingId)) return shown;
  const focused = all.find((f) => f.id === focusFindingId);
  return focused ? [focused, ...shown] : shown;
}

/** Drop severities the user switched off, optionally drop low-confidence, then sort. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severityFilter: SeverityFilter,
): FindingRecord[] {
  let shown = findings.filter((f) => severityFilter[f.severity as FilterableSeverity] ?? true);
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
