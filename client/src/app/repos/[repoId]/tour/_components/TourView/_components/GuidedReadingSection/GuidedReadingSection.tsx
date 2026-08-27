"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { SectionShell } from "../SectionShell";
import { truncateMiddle } from "../../helpers";
import { PATH_MAX_CHARS } from "../../constants";
import { s } from "./styles";

/**
 * Guided reading (R6) — the array arrives already in descending `file_rank`
 * order (A24); this component renders it as given and never re-sorts. A
 * `resolved: false` entry renders struck-through and **non-interactive**
 * (R11, A10) — no `href`/`onClick` is ever attached to it, asserted as the
 * absence of the handler rather than the presence of a class.
 */
export function GuidedReadingSection({
  section,
  repoFullName,
  indexedSha,
}: {
  section: OnboardingSection;
  repoFullName?: string | null;
  indexedSha?: string | null;
}) {
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
        {(section.reading ?? []).map((entry, i) => {
          const display = truncateMiddle(entry.path, PATH_MAX_CHARS);
          return (
            <li key={entry.path} style={s.item}>
              <span className="tnum" style={s.badge}>
                {i + 1}
              </span>
              <div>
                {entry.resolved && repoFullName && indexedSha ? (
                  <a
                    className="mono"
                    style={s.path}
                    href={githubBlobUrl(repoFullName, indexedSha, entry.path)}
                    target="_blank"
                    rel="noreferrer"
                    title={display !== entry.path ? entry.path : undefined}
                  >
                    {display}
                  </a>
                ) : (
                  <span
                    className="mono"
                    style={entry.resolved ? s.path : s.pathDead}
                    title={display !== entry.path ? entry.path : undefined}
                  >
                    {display}
                  </span>
                )}
                {!entry.resolved && <span style={s.deadNote}>{t("deadPath.note")}</span>}
                {entry.why && <div style={s.why}>{entry.why}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </SectionShell>
  );
}
