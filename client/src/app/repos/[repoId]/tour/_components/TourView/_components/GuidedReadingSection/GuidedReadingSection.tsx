"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import { SectionShell } from "../SectionShell";
import { s } from "./styles";

/**
 * Guided reading (R6) — the array arrives already in descending `file_rank`
 * order (A24); this component renders it as given and never re-sorts. A
 * `resolved: false` entry renders struck-through and non-interactive (R11,
 * A10) — no `href`/`onClick` is ever attached here, in this phase or B3.
 */
export function GuidedReadingSection({ section }: { section: OnboardingSection }) {
  const t = useTranslations("onboarding");
  const marker = !section.empty_reason && section.skeleton ? t("skeleton.sectionMarker") : null;

  return (
    <SectionShell
      kind="guided_reading"
      icon="ListChecks"
      title={section.title}
      emptyReason={section.empty_reason}
      skeletonMarker={marker}
    >
      <ol style={s.list}>
        {(section.reading ?? []).map((entry, i) => (
          <li key={entry.path} style={s.item}>
            <span className="tnum" style={s.badge}>
              {i + 1}
            </span>
            <div>
              <span className="mono" style={entry.resolved ? s.path : s.pathDead}>
                {entry.path}
              </span>
              {!entry.resolved && <span style={s.deadNote}>{t("deadPath.note")}</span>}
              {entry.why && <div style={s.why}>{entry.why}</div>}
            </div>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}
