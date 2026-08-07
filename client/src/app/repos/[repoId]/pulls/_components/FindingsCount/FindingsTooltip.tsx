/* FindingsTooltip — hover preview of a PR's findings, shown from the list's
   FINDINGS cell. Ported from design-mocks/src/11-prdetail_runs.jsx:38. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "./styles";

/** Markdown lives in `rationale`; the tooltip is one clamped line, so strip it. */
function stripMd(text: string | null | undefined): string {
  return (text ?? "").replace(/\*\*|`/g, "");
}

function lineRange(f: FindingRecord): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

export function FindingsTooltip({
  findings,
  loading,
  placement = "down",
}: {
  findings: FindingRecord[];
  loading: boolean;
  placement?: "up" | "down";
}) {
  const t = useTranslations("prReview");

  return (
    <div style={s.tooltip(placement)} role="tooltip">
      <div style={s.tooltipHeader}>
        <Icon.AlertOctagon size={12} />
        {loading ? t("list.findingsLoading") : t("verdict.findingsCount", { count: findings.length })}
      </div>
      {!loading && (
        <div style={s.tooltipBody}>
          {findings.map((f, i) => (
            <div key={f.id} style={s.tooltipItem(i < findings.length - 1)}>
              <div style={s.tooltipTitleRow}>
                <SeverityBadge severity={f.severity as Severity} compact />
                <span style={s.tooltipTitle}>{f.title}</span>
                <CategoryTag category={f.category} />
              </div>
              <div style={s.tooltipMetaRow}>
                <span className="mono" style={s.tooltipLocation}>
                  {f.file}:{lineRange(f)}
                </span>
                <ConfidenceNum value={f.confidence} />
              </div>
              <div style={s.tooltipRationale}>{stripMd(f.rationale)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
