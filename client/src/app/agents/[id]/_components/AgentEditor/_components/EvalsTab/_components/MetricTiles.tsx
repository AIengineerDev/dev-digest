"use client";

import { useTranslations } from "next-intl";
import type { EvalRunGroup } from "@devdigest/shared";
import { MetricCard } from "@devdigest/ui";
import { s } from "../styles";

/**
 * The latest run's three metrics, each against the run before it.
 *
 * Uses the same `MetricCard` as the Eval Dashboard rather than a hand-rolled
 * tile, so the colours mean the same thing in both places: recall is accent,
 * precision is ok-green, citation is warn-amber
 * (design-mocks/src/14-screen_skills.jsx:149). A metric that is blue on one
 * screen and grey on another is a metric nobody learns to read at a glance.
 */
export function MetricTiles({
  latest,
  previous,
  history,
}: {
  latest: EvalRunGroup | null;
  previous: EvalRunGroup | null;
  history: EvalRunGroup[];
}) {
  const t = useTranslations("agents");
  if (!latest) return null;

  // Oldest → newest, the direction a sparkline is read.
  const trend = (pick: (g: EvalRunGroup) => number) => [...history].reverse().map(pick);

  const rows = [
    {
      key: "recall",
      label: t("evals.metric.recall"),
      value: latest.recall,
      prev: previous?.recall,
      color: "var(--accent)",
      pick: (g: EvalRunGroup) => g.recall,
    },
    {
      key: "precision",
      label: t("evals.metric.precision"),
      value: latest.precision,
      prev: previous?.precision,
      color: "var(--ok)",
      pick: (g: EvalRunGroup) => g.precision,
    },
    {
      key: "citation",
      label: t("evals.metric.citation"),
      value: latest.citation_accuracy,
      prev: previous?.citation_accuracy,
      color: "var(--warn)",
      pick: (g: EvalRunGroup) => g.citation_accuracy,
    },
  ] as const;

  return (
    <div style={s.tiles}>
      {rows.map((r) => (
        <MetricCard
          key={r.key}
          label={r.label}
          value={Math.round(r.value * 100)}
          suffix="%"
          color={r.color}
          trend={trend(r.pick)}
          // No previous run is not "unchanged": omit the delta rather than
          // rendering a 0 that claims nothing moved.
          {...(r.prev === undefined ? {} : { delta: r.value - r.prev })}
        />
      ))}
      <MetricCard
        label={t("evals.metric.passed")}
        value={`${latest.passed}/${latest.cases_total}`}
        color="var(--text-secondary)"
      />
    </div>
  );
}
