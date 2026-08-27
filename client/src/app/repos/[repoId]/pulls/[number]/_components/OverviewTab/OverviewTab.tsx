"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { PrIntentRecord, ReviewRecord } from "@devdigest/shared";
import { PrBriefCard } from "../PrBriefCard";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { CardErrorBoundary } from "../../../../../../../components/card-error-boundary";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  intent: PrIntentRecord | null | undefined;
  /** The intent query is still in flight — the card waits rather than offering
   *  to derive something that may already exist. */
  intentLoading?: boolean;
  /** The PR's reviews and current head — `PrBriefCard`'s counts row is folded
   *  over these client-side rather than persisted, so a cached brief's counts
   *  stay live when a review lands after it was generated (R13). */
  reviews?: ReviewRecord[] | undefined;
  headSha?: string | null;
  /** Jumps to a `kind: 'file'` review-focus entry in the Diff tab (B3). */
  onFocusFile?: (path: string) => void;
}

export function OverviewTab({ prId, prBody, intent, intentLoading, reviews, headSha, onFocusFile }: OverviewTabProps) {
  return (
    <>
      {/* The brief is the one card on this tab whose payload is written by a
          model — risks, review focus and prose, all over the wire. A malformed
          one would otherwise blank the whole tab, taking Intent, Blast Radius
          and the description with it. See `CardErrorBoundary` for why this is
          one boundary and not a policy. */}
      {prId && (
        <CardErrorBoundary fallback="The brief couldn't be displayed. The rest of this page is unaffected.">
          <PrBriefCard prId={prId} reviews={reviews} headSha={headSha} onFocusFile={onFocusFile} />
        </CardErrorBoundary>
      )}
      {prId && <IntentCard prId={prId} intent={intent} loading={intentLoading} />}
      {prId && <BlastRadiusCard prId={prId} />}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
