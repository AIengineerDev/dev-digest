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
import type { PrFile, ReviewRecord, SmartDiffGroup } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffReveal } from "@/components/diff-viewer";
import { useSmartDiff } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import {
  buildAnnotations,
  buildStaleAnnotations,
  firstStaleMark,
  defaultOpenPredicate,
  findingsAtHead,
  groupFindingCount,
  staleFindings,
  staleHeadSha,
  withPatches,
} from "./helpers";
import { shortSha } from "../staleness";
import { s, groupMarkerFor } from "./styles";

interface SmartDiffViewerProps {
  prId: string | null;
  /** The PR's files, with patch text — smart-diff returns paths, not patches. */
  files: PrFile[];
  reviews: ReviewRecord[] | undefined;
  /** The PR's current head — reviews of an older head describe code that has
   *  since changed, and must not badge the diff the reviewer is reading. */
  headSha: string | null;
  commenting?: DiffCommentApi;
  /** Opens a finding's card in the Findings tab, without leaving the page. */
  onOpenFinding?: (findingId: string) => void;
}

export function SmartDiffViewer({
  prId,
  files,
  reviews,
  headSha,
  commenting,
  onOpenFinding,
}: SmartDiffViewerProps) {
  const t = useTranslations("prReview.smartDiff");
  const { data, isLoading, isError, error, refetch } = useSmartDiff(prId);

  // One reveal target for the whole viewer: clicking a badge in one group must
  // clear the highlight in another.
  const [reveal, setReveal] = React.useState<DiffReveal | null>(null);
  const revealLine = React.useCallback((path: string, line: number) => {
    setReveal((prev) => ({ path, line, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const findings = React.useMemo(() => findingsAtHead(reviews, headSha), [reviews, headSha]);
  const annotations = React.useMemo(
    () => buildAnnotations(data?.groups ?? [], findings),
    [data, findings],
  );
  // Every review ran against an older head → nothing badges this diff. Correct,
  // and indistinguishable from "no findings" unless the viewer says which.
  const stale = React.useMemo(() => staleFindings(reviews, headSha), [reviews, headSha]);
  const showStaleNotice = annotations.size === 0 && stale.length > 0;
  // Shown by default when nothing else marks this diff. A reviewer opening
  // Files changed wants to see where the problems are; an empty diff plus a
  // sentence explaining why it is empty is technically honest and practically
  // useless. They stay visibly marked as belonging to an older commit, and the
  // reader can put them away — which is what `override` remembers.
  const [override, setOverride] = React.useState<boolean | null>(null);
  const showStale = override ?? showStaleNotice;
  const staleAnnotations = React.useMemo(
    () => (showStale ? buildStaleAnnotations(data?.groups ?? [], stale) : null),
    [showStale, data, stale],
  );
  const shownAnnotations = staleAnnotations ?? annotations;

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

      {showStaleNotice && (
        <div style={s.staleBanner}>
          <span style={s.staleText}>
            {t("staleNotice", {
              count: stale.length,
              sha: shortSha(staleHeadSha(reviews, headSha)),
            })}
          </span>
          <button
            type="button"
            style={s.staleAction}
            onClick={() => {
              const next = !showStale;
              setOverride(next);
              // Revealing without going there leaves the reader looking at the
              // top of a 90-file diff for a mark that is 100 lines inside one
              // card. Take them to the first one; the rest are found from there.
              if (next) {
                const first = firstStaleMark(data?.groups ?? [], stale);
                if (first) revealLine(first.path, first.line);
              }
            }}
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
          openPaths={
            override === true && staleAnnotations ? new Set(staleAnnotations.keys()) : undefined
          }
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
  annotations: ReturnType<typeof buildAnnotations>;
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
