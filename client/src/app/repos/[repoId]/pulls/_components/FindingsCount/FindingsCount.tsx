/* FindingsCount — the PR list's FINDINGS cell: one icon+number per severity
   that actually occurs, e.g. "⊘3 ⚠5 ⚲2". Read-only; the click-to-filter chips
   live on the PR detail page (FindingsPanel), where there is a list to filter. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import { SEVERITIES } from "./constants";
import { s } from "./styles";

/**
 * `null` and all-zero are different states and render differently:
 * `null` = the PR has never been reviewed → em dash, same as the score ring;
 * all-zero = it was reviewed and came back clean → "0 findings" reads wrong as
 * a dash, so we show nothing but keep the cell distinguishable via the label.
 * Severities with a zero count are dropped so a clean-ish PR isn't a wall of 0s.
 */
export function FindingsCount({
  counts,
}: {
  counts?: { CRITICAL: number; WARNING: number; SUGGESTION: number } | null;
}) {
  if (!counts) return <span style={s.muted}>—</span>;

  const present = SEVERITIES.filter((sv) => counts[sv] > 0);
  if (present.length === 0) return <span style={s.muted}>—</span>;

  return (
    <div style={s.cell}>
      {present.map((sv) => {
        const meta = SEV[sv];
        const SevIcon = Icon[meta.icon];
        return (
          <span key={sv} style={s.group(meta.c)} title={`${counts[sv]} ${meta.label}`}>
            <SevIcon size={12} />
            <span className="tnum">{counts[sv]}</span>
          </span>
        );
      })}
    </div>
  );
}
