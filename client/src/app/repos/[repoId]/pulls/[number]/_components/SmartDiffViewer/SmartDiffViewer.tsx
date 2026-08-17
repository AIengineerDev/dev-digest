/* SmartDiffViewer — the PR's changed files in reviewer order: core logic first,
   wiring next, boilerplate last and collapsed. After a review has run, each
   file carries a clickable "N findings" badge that scrolls the diff to the
   flagged line.

   Costs nothing to open: the grouping comes from GET /pulls/:id/smart-diff
   (deterministic, no model call) and the finding detail from the reviews the
   page already fetched. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState } from "@devdigest/ui";
import type { PrFile, SmartDiffGroup } from "@devdigest/shared";
import type { DiffAnnotations, DiffReveal } from "@/components/diff-viewer";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { ApiError } from "@/lib/api";
import type { FindingMarks } from "../DiffTab/useFindingMarks";
import { defaultOpenPredicate, groupFindingCount, withPatches } from "./helpers";
import { shortSha } from "../staleness";
import { s, groupMarkerFor } from "./styles";

interface SmartDiffViewerProps {
  /** The PR's files, with patch text — smart-diff returns paths, not patches. */
  files: PrFile[];
  /** Marks, stale state and the reveal target, owned by `DiffTab` so that the
   *  Original-order viewer shows exactly the same findings. */
  marks: FindingMarks;
  commenting?: DiffCommentApi;
  /** Opens a finding's card in the Findings tab, without leaving the page. */
  onOpenFinding?: (findingId: string) => void;
}

export function SmartDiffViewer({
  files,
  marks,
  commenting,
  onOpenFinding,
}: SmartDiffViewerProps) {
  const t = useTranslations("prReview.smartDiff");
  const {
    annotations: shownAnnotations,
    smartDiff: data,
    isLoading,
    isError,
    error,
    refetch,
    staleCount,
    staleHead,
    staleOnly,
    showStale,
    staleExpanded,
    toggleStale,
    reveal,
    revealLine,
  } = marks;

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton height={18} width={220} />
        <Skeleton height={120} />
        <Skeleton height={44} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title={t("errorTitle")}
        body={error instanceof ApiError ? error.message : t("errorBody")}
        onRetry={() => refetch()}
      />
    );
  }

  const nonEmpty = data.groups.filter((g) => g.files.length > 0);
  if (nonEmpty.length === 0) return <div style={s.empty}>{t("empty")}</div>;

  const split = data.split_suggestion;

  return (
    <div style={s.wrap}>
      {split.too_big && (
        <div style={s.splitBanner}>
          <span style={s.splitTitle}>{t("largeTitle", { lines: split.total_lines })}</span>
          {split.proposed_splits.length > 0 && (
            <>
              <span style={s.splitBody}>{t("largeBody")}</span>
              <ul style={s.splitList}>
                {split.proposed_splits.map((p) => (
                  <li key={p.name} className="mono">
                    {p.name} · {t("filesCount", { count: p.files.length })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {staleOnly && (
        <div style={s.staleBanner}>
          <span style={s.staleText}>
            {t("staleNotice", { count: staleCount, sha: shortSha(staleHead) })}
          </span>
          <button
            type="button"
            style={s.staleAction}
            onClick={toggleStale}
          >
            {t(showStale ? "staleNoticeHide" : "staleNoticeAction")}
          </button>
        </div>
      )}

      {nonEmpty.map((group) => (
        <Group
          key={group.role}
          group={group}
          files={files}
          annotations={shownAnnotations}
          // Only when the reader asked for them by hand. On the default reveal
          // this would expand every file carrying a stale mark — on a 90-file
          // PR that is tens of thousands of rendered lines, and the page grinds
          // before it helps. The file badges are visible either way.
          openPaths={staleExpanded ? new Set(shownAnnotations.keys()) : undefined}
          commenting={commenting}
          reveal={reveal}
          onRevealLine={revealLine}
          onOpenFinding={onOpenFinding}
        />
      ))}
    </div>
  );
}

function Group({
  group,
  files,
  annotations,
  openPaths,
  commenting,
  reveal,
  onRevealLine,
  onOpenFinding,
}: {
  group: SmartDiffGroup;
  files: PrFile[];
  annotations: DiffAnnotations;
  /** Files to expand beyond the role heuristic — the ones holding revealed
   *  stale marks. */
  openPaths?: ReadonlySet<string>;
  commenting?: DiffCommentApi;
  reveal: DiffReveal | null;
  onRevealLine: (path: string, line: number) => void;
  onOpenFinding?: (findingId: string) => void;
}) {
  const t = useTranslations("prReview.smartDiff");
  const findingCount = groupFindingCount(group);
  return (
    <section style={s.group}>
      <header style={s.groupHeader}>
        <span style={groupMarkerFor(group.role)} />
        <span style={s.groupLabel}>{t(`role.${group.role}.label`)}</span>
        <span style={s.groupHint}>{t(`role.${group.role}.hint`)}</span>
        <span style={s.groupCount}>
          {t("filesCount", { count: group.files.length })}
          {findingCount > 0 ? ` · ${t("findingsBadge", { count: findingCount })}` : ""}
        </span>
      </header>
      <DiffViewer
        files={withPatches(group.files, files)}
        commenting={commenting}
        annotations={annotations}
        defaultOpenFor={defaultOpenPredicate(group, openPaths)}
        reveal={reveal}
        onRevealLine={onRevealLine}
        onOpenFinding={onOpenFinding}
      />
    </section>
  );
}
