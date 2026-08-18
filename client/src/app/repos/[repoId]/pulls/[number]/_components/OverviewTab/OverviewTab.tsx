"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { PrIntentRecord, ReviewRecord } from "@devdigest/shared";
import { PrBriefCard } from "../PrBriefCard";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
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
      {prId && (
        <PrBriefCard prId={prId} reviews={reviews} headSha={headSha} onFocusFile={onFocusFile} />
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
