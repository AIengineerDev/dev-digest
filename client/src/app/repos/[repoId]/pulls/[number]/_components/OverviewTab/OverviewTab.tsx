"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
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
}

export function OverviewTab({ prId, prBody, intent, intentLoading }: OverviewTabProps) {
  return (
    <>
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
