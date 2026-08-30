/* FindingsPanel — severity counters/filter + hide-low-confidence + j/k navigation
   + FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Chip, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION, SEVERITIES } from "./constants";
import { allSeveritiesOn, countBySeverity, visibleFindings, withFocused } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  agentId,
  focusFindingId = null,
}: {
  findings: FindingRecord[];
  prId: string;
  /** The agent that produced this run — owner of any eval case built here. */
  agentId?: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
  /** The finding a Smart Diff badge was clicked through to: shown whatever the
   *  filters say, focused, expanded and scrolled to. */
  focusFindingId?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severityFilter, setSeverityFilter] = React.useState(allSeveritiesOn);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const counts = React.useMemo(() => countBySeverity(findings), [findings]);
  const shown = React.useMemo(
    () => withFocused(visibleFindings(findings, hideLow, severityFilter), findings, focusFindingId),
    [findings, hideLow, severityFilter, focusFindingId],
  );

  // Send focus back to the top whenever the visible set changes: j/k and the
  // a/d shortcuts address `shown` by index, so a stale index after filtering
  // would fire accept/dismiss against a different finding than the marked one.
  React.useEffect(() => setFocusIdx(0), [severityFilter, hideLow]);

  // A jump from Smart Diff moves the j/k cursor onto the finding it asked for,
  // so the keyboard picks up where the click left off rather than at the top.
  React.useEffect(() => {
    if (!focusFindingId) return;
    const idx = shown.findIndex((f) => f.id === focusFindingId);
    if (idx >= 0) setFocusIdx(idx);
  }, [focusFindingId, shown]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        {SEVERITIES.map((sv) => (
          <Chip
            key={sv}
            active={severityFilter[sv]}
            onClick={() => setSeverityFilter((prev) => ({ ...prev, [sv]: !prev[sv] }))}
            icon={SEV[sv].icon}
            count={counts[sv]}
            color={SEV[sv].c}
          >
            {SEV[sv].label}
          </Chip>
        ))}
        <div style={s.divider} />
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0 || f.id === focusFindingId}
              revealed={f.id === focusFindingId}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              agentId={agentId}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
