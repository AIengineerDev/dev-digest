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
  defaultOpenPredicate,
  findingsAtHead,
  groupFindingCount,
  withPatches,
} from "./helpers";
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
}

export function SmartDiffViewer({ prId, files, reviews, headSha, commenting }: SmartDiffViewerProps) {
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

      {nonEmpty.map((group) => (
        <Group
          key={group.role}
          group={group}
          files={files}
          annotations={annotations}
          commenting={commenting}
          reveal={reveal}
          onRevealLine={revealLine}
        />
      ))}
    </div>
  );
}

function Group({
  group,
  files,
  annotations,
  commenting,
  reveal,
  onRevealLine,
}: {
  group: SmartDiffGroup;
  files: PrFile[];
  annotations: ReturnType<typeof buildAnnotations>;
  commenting?: DiffCommentApi;
  reveal: DiffReveal | null;
  onRevealLine: (path: string, line: number) => void;
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
        defaultOpenFor={defaultOpenPredicate(group)}
        reveal={reveal}
        onRevealLine={onRevealLine}
      />
    </section>
  );
}
