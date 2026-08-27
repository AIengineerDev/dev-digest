/** Pure helpers behind PrBriefCard. No React, no fetching. */

import type { IconName } from "@devdigest/ui";
import type { Risk, RiskSeverity } from "@devdigest/shared";
import { RISK_DISPLAY_CAP } from "./constants";

const RISK_SEVERITY_RANK: Record<RiskSeverity, number> = { high: 3, medium: 2, low: 1 };

/** Risks sorted worst-first. Stable (Array.prototype.sort is stable in every
 *  runtime this app targets), so equal-severity risks keep the model's order. */
export function sortedRisks(risks: readonly Risk[]): Risk[] {
  return [...risks].sort((a, b) => RISK_SEVERITY_RANK[b.severity] - RISK_SEVERITY_RANK[a.severity]);
}

/**
 * The first `RISK_DISPLAY_CAP` risks, worst-first, plus how many are hidden
 * (C3). The full array is what gets counted anywhere a count is shown, so the
 * count and the list never disagree about how many risks there are.
 */
export function visibleRisks(risks: readonly Risk[]): { shown: Risk[]; hidden: number } {
  const sorted = sortedRisks(risks);
  return { shown: sorted.slice(0, RISK_DISPLAY_CAP), hidden: Math.max(0, sorted.length - RISK_DISPLAY_CAP) };
}

/**
 * `Risk.kind` is a free-form model string (Q5 — not an enum), so an icon
 * lookup keyed by it can always miss. `Icon[undefined]` renders nothing but
 * `Icon[someBogusKey]` is `undefined` too and throws when JSX tries to
 * construct it as a component — with zero error boundaries in this client
 * (`client/INSIGHTS.md`, *Open Questions*) that blanks the whole page. This
 * always returns a real key; the raw `kind` string is still shown as the
 * pill's label so the specific claim is not lost.
 */
const RISK_ICON: Partial<Record<string, IconName>> = {
  security: "Shield",
  performance: "Zap",
  correctness: "Bug",
  data: "Database",
  breaking_change: "AlertTriangle",
  concurrency: "GitBranch",
  reliability: "AlertOctagon",
};
const FALLBACK_RISK_ICON: IconName = "Info";

export function iconForRiskKind(kind: string): IconName {
  return RISK_ICON[kind] ?? FALLBACK_RISK_ICON;
}

/**
 * Middle-truncation (C4): keeps the opening and the conclusion of a long
 * `what`/`why`, or the tail of a long path, legible instead of clipping the
 * end. The caller always pairs this with a `title` carrying the full string.
 */
export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const keep = maxChars - 1; // reserve one char for the ellipsis
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}
