"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import { SectionShell } from "../SectionShell";
import { s } from "./styles";

/**
 * Critical paths (R3) — chains from `getCriticalPaths`, annotated with the
 * endpoints/crons their files declare. The model writes only `why`, keyed by
 * `chain_id`; it may not add, remove or reorder a chain's files. The `Open`
 * link (Q3) and full dead-path handling (R11) land in Phase B3.
 */
export function CriticalPathsSection({ section }: { section: OnboardingSection }) {
  const t = useTranslations("onboarding");
  const marker = !section.empty_reason && section.skeleton ? t("skeleton.sectionMarker") : null;

  return (
    <SectionShell
      kind="critical_paths"
      icon="Activity"
      title={section.title}
      emptyReason={section.empty_reason}
      skeletonMarker={marker}
    >
      <div style={s.list}>
        {(section.paths ?? []).map((chain) => (
          <div key={chain.chain_id} style={s.chain}>
            {chain.why && <p style={s.why}>{chain.why}</p>}
            <div style={s.files}>
              {chain.files.map((file, i) => {
                const dead = chain.resolved[i] === false;
                return (
                  <div key={file} style={s.fileRow}>
                    <span className="mono" style={dead ? s.filePathDead : s.filePath}>
                      {file}
                    </span>
                    {dead && <span style={s.deadNote}>{t("deadPath.note")}</span>}
                  </div>
                );
              })}
            </div>
            {chain.endpoints.length > 0 && (
              <div style={s.endpoints}>
                {chain.endpoints.map((ep) => (
                  <span key={ep} className="mono" style={s.endpoint}>
                    {ep}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
