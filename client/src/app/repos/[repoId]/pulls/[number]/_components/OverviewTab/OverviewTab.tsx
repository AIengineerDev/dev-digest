"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { IntentCard } from "../IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  intent: PrIntentRecord | null | undefined;
}

export function OverviewTab({ prId, prBody, intent }: OverviewTabProps) {
  return (
    <>
      {prId && <IntentCard prId={prId} intent={intent} />}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
