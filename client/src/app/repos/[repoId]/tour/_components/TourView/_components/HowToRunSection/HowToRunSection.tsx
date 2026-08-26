"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import { SectionShell } from "../SectionShell";
import { s } from "./styles";

/**
 * How to run (R4, R5) — every command is a verbatim member of the whitelist
 * derived from the repo's own config facts; the server has already dropped
 * anything else before persistence, so this component never filters. The
 * scrollable, full-string Copy control (C9, B3.6) lands in Phase B3.
 */
export function HowToRunSection({ section }: { section: OnboardingSection }) {
  const t = useTranslations("onboarding");
  const marker = !section.empty_reason && section.skeleton ? t("skeleton.sectionMarker") : null;

  return (
    <SectionShell
      kind="how_to_run"
      icon="Command"
      title={section.title}
      emptyReason={section.empty_reason}
      skeletonMarker={marker}
    >
      {section.body && <p style={s.why}>{section.body}</p>}
      <div style={s.list}>
        {(section.run_steps ?? []).map((step, i) => (
          <div key={`${i}-${step.command}`} style={s.step}>
            <span className="tnum" style={s.index}>
              {i + 1}
            </span>
            <div style={s.commandWrap}>
              <code className="mono" style={s.command}>
                {step.command}
              </code>
              {step.why && <p style={s.why}>{step.why}</p>}
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
