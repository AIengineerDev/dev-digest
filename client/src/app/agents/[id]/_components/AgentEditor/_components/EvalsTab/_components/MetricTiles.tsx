"use client";

import { useTranslations } from "next-intl";
import type { EvalRunGroup } from "@devdigest/shared";
import { pct, deltaPts } from "../helpers";
import { s } from "../styles";

/** The three metrics of the latest run, each against the run before it. */
export function MetricTiles({
  latest,
  previous,
}: {
  latest: EvalRunGroup | null;
  previous: EvalRunGroup | null;
}) {
  const t = useTranslations("agents");
  if (!latest) return null;

  const rows = [
    { key: "recall", value: latest.recall, pick: (g: EvalRunGroup) => g.recall },
    { key: "precision", value: latest.precision, pick: (g: EvalRunGroup) => g.precision },
    {
      key: "citation",
      value: latest.citation_accuracy,
      pick: (g: EvalRunGroup) => g.citation_accuracy,
    },
  ] as const;

  return (
    <div style={s.tiles}>
      {rows.map((r) => {
        const d = deltaPts(latest, previous, r.pick);
        return (
          <div key={r.key} style={s.tile}>
            <span style={s.tileLabel}>{t(`evals.metric.${r.key}`)}</span>
            <span style={s.tileValue}>{pct(r.value)}</span>
            {/* No previous run is not "unchanged": show nothing rather than 0. */}
            <span style={s.delta(d === null ? null : d >= 0)}>
              {d === null ? t("evals.noBaseline") : `${d >= 0 ? "+" : ""}${d} pts`}
            </span>
          </div>
        );
      })}
      <div style={s.tile}>
        <span style={s.tileLabel}>{t("evals.metric.passed")}</span>
        <span style={s.tileValue}>
          {latest.passed}/{latest.cases_total}
        </span>
        <span style={s.delta(null)}>
          {latest.cost_usd === null ? "—" : `$${latest.cost_usd.toFixed(4)}`}
        </span>
      </div>
    </div>
  );
}
