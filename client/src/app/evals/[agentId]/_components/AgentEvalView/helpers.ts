import type { EvalRunGroup } from "@devdigest/shared";

/**
 * The regression banner the mock puts above the metric cards
 * (design-mocks/src/14-screen_skills.jsx:145).
 *
 * Only a DROP is worth a banner: an improvement needs no alerting, and a banner
 * that fires on every run is one nobody reads. Null when there is no previous
 * run — "no baseline" is not "no regression".
 */
export function regressionAlert(
  latest: EvalRunGroup | null,
  previous: EvalRunGroup | null,
): { metric: string; pts: number } | null {
  if (!latest || !previous) return null;
  const drops = (
    [
      ["precision", latest.precision - previous.precision],
      ["recall", latest.recall - previous.recall],
      ["citation accuracy", latest.citation_accuracy - previous.citation_accuracy],
    ] as const
  )
    .map(([metric, d]) => ({ metric, pts: Math.round(d * 100) }))
    .filter((x) => x.pts < 0);
  if (drops.length === 0) return null;
  // The worst drop, not the first: a 1pt wobble next to a 12pt collapse should
  // not be what the banner names.
  return drops.reduce((worst, x) => (x.pts < worst.pts ? x : worst));
}

/** Oldest → newest, which is the direction a trend line is read. */
export function trendOf(groups: EvalRunGroup[], pick: (g: EvalRunGroup) => number): number[] {
  return [...groups].reverse().map(pick);
}
