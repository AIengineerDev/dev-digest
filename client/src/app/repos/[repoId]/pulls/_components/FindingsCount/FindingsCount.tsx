/* FindingsCount — the PR list's FINDINGS cell: one icon+number per severity
   that actually occurs, e.g. "⊘3 ⚠5 ⚲2", with a hover preview of the findings
   themselves. Read-only; the click-to-filter chips live on the PR detail page
   (FindingsPanel), where there is a list to filter. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsTooltip } from "./FindingsTooltip";
import { SEVERITIES } from "./constants";
import { s } from "./styles";

/**
 * `null` and all-zero are different states server-side but render the same here:
 * `null` = the PR has never been reviewed; all-zero = it was reviewed and came
 * back clean. Both print an em dash, matching how the score ring renders an
 * unreviewed PR. Severities with a zero count are dropped so a nearly clean PR
 * is not a row of zeros — unlike the detail-page chips, where a 0 is a switch
 * you can still turn on.
 */
export function FindingsCount({
  counts,
  prId,
  placement = "down",
}: {
  counts?: { CRITICAL: number; WARNING: number; SUGGESTION: number } | null;
  prId?: string | null;
  placement?: "up" | "down";
}) {
  const [hovered, setHovered] = React.useState(false);

  // Findings are fetched only while hovering: passing null disables the query
  // (`enabled: !!prId`), so an unhovered list makes no extra requests, and
  // TanStack Query caches the result for repeat hovers.
  const { data: reviews, isLoading } = usePrReviews(hovered ? prId : null);
  const findings = React.useMemo(() => (reviews ?? []).flatMap((r) => r.findings), [reviews]);

  if (!counts) return <span style={s.muted}>—</span>;

  const present = SEVERITIES.filter((sv) => counts[sv] > 0);
  if (present.length === 0) return <span style={s.muted}>—</span>;

  return (
    <div
      style={s.cell}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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
      {hovered && prId && (
        <FindingsTooltip findings={findings} loading={isLoading} placement={placement} />
      )}
    </div>
  );
}
