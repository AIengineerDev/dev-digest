"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingSection } from "@devdigest/shared";
import { SectionShell } from "../SectionShell";
import { s } from "./styles";

/**
 * How to run (R4, R5) — every command is a verbatim member of the whitelist
 * derived from the repo's own config facts; the server has already dropped
 * anything else before persistence, so this component never filters.
 *
 * The command renders in a horizontally scrollable `<code>` (C9) so a long
 * script value never breaks layout, and the Copy control is a **labelled**
 * `<button>` announcing the copy — not the icon-only `<span>` the design mock
 * draws — and always copies the **full** string regardless of what scrolled
 * off-screen.
 */
export function HowToRunSection({ section }: { section: OnboardingSection }) {
  const t = useTranslations("onboarding");
  const marker = !section.empty_reason && section.skeleton ? t("skeleton.sectionMarker") : null;
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  const timerRef = React.useRef<number | null>(null);

  // Clear any pending "copied" reset on unmount, so a step copied just before
  // navigating away never calls setState on an unmounted component.
  React.useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  const copy = React.useCallback((index: number, command: string) => {
    navigator.clipboard?.writeText(command).catch(() => {
      /* clipboard unavailable — the button simply does not confirm */
    });
    setCopiedIndex(index);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 1500);
  }, []);

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
        {(section.run_steps ?? []).map((step, i) => {
          const copied = copiedIndex === i;
          const CopyIcon = copied ? Icon.Check : Icon.Copy;
          return (
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
              <button
                type="button"
                style={s.copyButton}
                aria-label={copied ? t("copy.copied") : t("copy.label")}
                onClick={() => copy(i, step.command)}
              >
                <CopyIcon size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}
