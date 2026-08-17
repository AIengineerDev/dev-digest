"use client";

import React, { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory/RunHistory";
import { severityCountsByRun } from "../RunHistory/helpers";
import { isStaleRun } from "../staleness";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { s } from "./styles";
import type { FindingRecord, ReviewRecord, RunSummary, PrCommit } from "@devdigest/shared";
import type { UseMutationResult } from "@tanstack/react-query";

interface FindingsTabProps {
  prId: string | null;
  liveRunIds: string[];
  reviewRunning: boolean;
  lethalTrifecta: FindingRecord[];
  /** A finding jumped to from Smart Diff (`?finding=`): its run's accordion
   *  opens, its card is revealed, and the current filters cannot hide it. */
  focusFindingId?: string | null;
  runs: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  cancelMutation: UseMutationResult<any, any, string, any>;
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (id: string) => void;
  onDelete: (id: string) => void;
  onRunDone: () => void;
}

export function FindingsTab({
  prId,
  liveRunIds,
  reviewRunning,
  lethalTrifecta,
  focusFindingId,
  runs,
  prRuns,
  prCommits,
  cancelMutation,
  repoFullName,
  headSha,
  onOpenTrace,
  onDelete,
  onRunDone,
}: FindingsTabProps) {
  const t = useTranslations("prReview");

  const handleCancelAll = useCallback(() => {
    liveRunIds.forEach((id) => cancelMutation.mutate(id));
  }, [liveRunIds, cancelMutation]);

  const handleOpenFirstTrace = useCallback(() => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  }, [liveRunIds, onOpenTrace]);

  const handleOpenTrace = useCallback(
    (id: string) => {
      onOpenTrace(id);
    },
    [onOpenTrace],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onDelete(id);
    },
    [onDelete],
  );

  // The timeline shows the same severity breakdown as the PR list; the counts
  // come from the reviews already loaded here, keyed by run.
  const severityCounts = React.useMemo(() => severityCountsByRun(runs), [runs]);

  // Review runs default to the CURRENT head only. A PR that has been reviewed
  // many times accumulates runs against long-gone revisions, and their findings
  // read exactly like findings about the code as it stands — the timeline above
  // keeps every run (it is a history) but marks the stale ones.
  const [onlyCurrentHead, setOnlyCurrentHead] = React.useState(true);
  const staleRunCount = React.useMemo(
    () => runs.filter((r) => isStaleRun(r.head_sha, headSha)).length,
    [runs, headSha],
  );
  const shownRuns = React.useMemo(
    () => (onlyCurrentHead ? runs.filter((r) => !isStaleRun(r.head_sha, headSha)) : runs),
    [runs, headSha, onlyCurrentHead],
  );

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const handleGoToReview = useCallback(
    (runId: string) => {
      // The timeline lists stale runs, this list hides them by default — so
      // jumping to a stale run has to reveal it, or the click does nothing.
      const review = runs.find((r) => r.run_id === runId);
      if (review && isStaleRun(review.head_sha, headSha)) setOnlyCurrentHead(false);
      setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
    },
    [runs, headSha],
  );

  // A jump from Smart Diff must land even when the run that produced the
  // finding is one this list hides by default.
  const focusReview = React.useMemo(
    () =>
      focusFindingId ? runs.find((r) => r.findings.some((f) => f.id === focusFindingId)) : undefined,
    [runs, focusFindingId],
  );
  React.useEffect(() => {
    if (focusReview && isStaleRun(focusReview.head_sha, headSha)) setOnlyCurrentHead(false);
  }, [focusReview, headSha]);

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancelMutation.isPending}
                  onClick={handleCancelAll}
                >
                  Cancel
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={handleOpenFirstTrace}>
                  Open run trace
                </Button>
              </div>
            }
          >
            Live review
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={onRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>Review in progress…</span>
          <span style={s.reviewInProgressSub}>
            the agent is analyzing the diff — this can take a while on large PRs.
          </span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>Lethal Trifecta detected</span>
          <Badge color="var(--crit)" bg="transparent">
            {lethalTrifecta.length} finding(s)
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel
            icon="Activity"
            right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>runs &amp; commits · newest first</span>}
          >
            Timeline
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            severityCounts={severityCounts}
            currentHeadSha={headSha}
            onOpenTrace={handleOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
          />
        </div>
      )}

      <SectionLabel
        icon="AlertOctagon"
        right={
          <span style={s.runsToolbar}>
            {staleRunCount > 0 && (
              <label style={s.onlyCurrentHead} title={t("staleness.onlyCurrentHint", { count: staleRunCount })}>
                <input
                  type="checkbox"
                  checked={onlyCurrentHead}
                  onChange={(e) => setOnlyCurrentHead(e.target.checked)}
                />
                {t("staleness.onlyCurrent")}
              </label>
            )}
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>grouped by run · newest first</span>
          </span>
        }
      >
        Review runs
      </SectionLabel>
      {runs.length === 0 ? (
        reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState
            icon="Sparkles"
            title="No findings yet"
            body="Run a review to generate findings. Use Run Review ▾ above (run all enabled agents or a specific one)."
          />
        )
      ) : shownRuns.length === 0 ? (
        <EmptyState
          icon="History"
          title={t("staleness.allHiddenTitle")}
          body={t("staleness.allHiddenBody")}
        />
      ) : (
        prId &&
        shownRuns.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            // Arriving with a finding to show, the newest run is not the one
            // being asked for: opening it too puts an unrelated (often empty)
            // panel between the reader and the card they clicked, and shifts
            // the card out from under the scroll. The run that holds the
            // finding opens itself.
            defaultOpen={focusFindingId ? false : i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
            focusFindingId={focusFindingId}
          />
        ))
      )}
    </section>
  );
}
