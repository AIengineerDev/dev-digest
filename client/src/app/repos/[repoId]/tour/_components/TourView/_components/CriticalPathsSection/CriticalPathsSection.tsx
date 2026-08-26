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
 * Critical paths (R3) — chains from `getCriticalPaths`, annotated with the
 * endpoints/crons their files declare. The model writes only `why`, keyed by
 * `chain_id`; it may not add, remove or reorder a chain's files.
 *
 * A `resolved[i] === false` file (R11) renders struck-through with **no**
 * `href`/`onClick` at all — asserted as the absence of the handler, not the
 * presence of a class (A10): a styled-but-clickable link is the failure
 * mode. A resolved file's `Open` control links to the host provider at the
 * tour's own `indexed_sha` (Q3), so line numbers/paths stay pinned to what
 * this tour actually read, in a new tab.
 */
export function CriticalPathsSection({
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
                const display = truncateMiddle(file, PATH_MAX_CHARS);
                return (
                  <div key={file} style={s.fileRow}>
                    <span
                      className="mono"
                      style={dead ? s.filePathDead : s.filePath}
                      title={display !== file ? file : undefined}
                    >
                      {display}
                    </span>
                    {dead && <span style={s.deadNote}>{t("deadPath.note")}</span>}
                    {!dead && repoFullName && indexedSha && (
                      <a
                        className="mono"
                        style={s.openLink}
                        href={githubBlobUrl(repoFullName, indexedSha, file)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("open")}
                      </a>
                    )}
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
