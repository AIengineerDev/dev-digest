"use client";

import React from "react";
import type { ReviewRecord, SmartDiff } from "@devdigest/shared";
import type { DiffAnnotations, DiffReveal } from "@/components/diff-viewer";
import { useSmartDiff } from "@/lib/hooks";
import {
  buildAnnotations,
  buildStaleAnnotations,
  firstStaleMark,
  staleFindings,
  staleHeadSha,
} from "../SmartDiffViewer/helpers";
import { findingsAtHead } from "../reviewsAtHead";

/**
 * The finding marks for a PR's diff, owned above both viewers.
 *
 * Smart order and Original order are the same files in a different sequence —
 * the toggle says nothing about whether the PR has findings. When this lived
 * inside `SmartDiffViewer`, switching to Original silently dropped every badge,
 * so a reviewer who preferred the flat view saw a clean diff over flagged code.
 * One hook, one set of marks, both viewers.
 *
 * The stale reveal state lives here for the same reason: it must survive the
 * toggle, or putting the old findings away in one view brings them back in the
 * other.
 */
export interface FindingMarks {
  /** What to draw: current-head marks, or the stale ones when those are shown. */
  annotations: DiffAnnotations;
  /** The smart-diff projection, or undefined while it loads / after it fails. */
  smartDiff: SmartDiff | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** Findings held back because their review ran against an older head. */
  staleCount: number;
  /** Short sha of the head those findings describe. */
  staleHead: string | null;
  /** True when the only findings this diff has are stale — the notice case. */
  staleOnly: boolean;
  /** Whether the stale marks are currently drawn. */
  showStale: boolean;
  /** True only when the reader turned them on by hand — files expand then. */
  staleExpanded: boolean;
  toggleStale: () => void;
  /** Highlight+scroll target, shared so a click in one group clears another.
   *  `line: null` is a FILE-level reveal — a brief's review-focus entry. */
  reveal: DiffReveal | null;
  revealLine: (path: string, line: number | null) => void;
}

export function useFindingMarks(
  prId: string | null,
  reviews: ReviewRecord[] | undefined,
  headSha: string | null,
  /** A file to reveal on mount — the target of a brief's review-focus jump
   *  (B3). `DiffTab` unmounts whenever the reader leaves the Diff tab, so a
   *  fresh mount is exactly what makes clicking the same entry twice scroll
   *  twice: there is no stale `nonce` to fight, because there is no prior
   *  instance to compare against. */
  focusFile?: string | null,
): FindingMarks {
  const { data, isLoading, isError, error, refetch } = useSmartDiff(prId);

  // The lazy initializer, not an effect: `DiffTab` unmounts whenever the
  // reader leaves the Diff tab (`page.tsx`'s `{tab === "diff" && …}`), so a
  // fresh mount is exactly what makes clicking the same review-focus entry
  // twice scroll twice — there is no stale target to fight, because there is
  // no prior instance of this hook to compare against.
  const [reveal, setReveal] = React.useState<DiffReveal | null>(() =>
    focusFile ? { path: focusFile, line: null, nonce: 0 } : null,
  );
  const revealLine = React.useCallback((path: string, line: number | null) => {
    setReveal((prev) => ({ path, line, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const findings = React.useMemo(() => findingsAtHead(reviews, headSha), [reviews, headSha]);
  const current = React.useMemo(
    () => buildAnnotations(data?.groups ?? [], findings),
    [data, findings],
  );
  const stale = React.useMemo(() => staleFindings(reviews, headSha), [reviews, headSha]);
  const staleOnly = current.size === 0 && stale.length > 0;

  // Shown by default when nothing else marks this diff: a reviewer opening the
  // tab wants to see where the problems are, and an empty diff with a sentence
  // under it is not that. `override` remembers a reader who put them away.
  const [override, setOverride] = React.useState<boolean | null>(null);
  const showStale = override ?? staleOnly;
  const staleAnnotations = React.useMemo(
    () => (showStale ? buildStaleAnnotations(data?.groups ?? [], stale) : null),
    [showStale, data, stale],
  );

  const toggleStale = React.useCallback(() => {
    const next = !showStale;
    setOverride(next);
    // Revealing without going there leaves the reader at the top of a long diff
    // hunting for a mark a hundred lines inside a card.
    if (next) {
      const first = firstStaleMark(data?.groups ?? [], stale);
      if (first) revealLine(first.path, first.line);
    }
  }, [showStale, data, stale, revealLine]);

  return {
    annotations: staleAnnotations ?? current,
    smartDiff: data,
    isLoading,
    isError,
    error,
    refetch,
    staleCount: stale.length,
    staleHead: staleHeadSha(reviews, headSha),
    staleOnly,
    showStale,
    staleExpanded: override === true,
    toggleStale,
    reveal,
    revealLine,
  };
}
