"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { OnboardingSection } from "@devdigest/shared";
import { SectionShell } from "../SectionShell";
import { sortTasksByDifficulty } from "../../helpers";
import { DIFFICULTY_COLOR } from "../../constants";
import { s } from "./styles";

/**
 * First tasks (R8, R9) — up to 6 server-selected candidates, difficulty
 * computed in code and never taken from the model (R9). Sorted ascending by
 * difficulty (design proposal, spec `:301-303`) so the easiest entry is
 * top-left. The difficulty-basis line ("Low · 1 caller · rank p31") is added
 * in Phase B3.1.
 */
export function FirstTasksSection({ section }: { section: OnboardingSection }) {
  const t = useTranslations("onboarding");
  const marker = !section.empty_reason && section.skeleton ? t("skeleton.sectionMarker") : null;
  const tasks = sortTasksByDifficulty(section.tasks ?? []);

  return (
    <SectionShell
      kind="first_tasks"
      icon="Target"
      title={section.title}
      emptyReason={section.empty_reason}
      skeletonMarker={marker}
    >
      <div style={s.grid}>
        {tasks.map((task) => (
          <div key={task.candidate_id} style={s.card}>
            <div style={s.title}>{task.title}</div>
            <div className="mono" style={s.scope}>
              {task.scope}
            </div>
            {task.why && <p style={s.why}>{task.why}</p>}
            <Badge color={DIFFICULTY_COLOR[task.difficulty]} bg="transparent" style={{ border: "1px solid var(--border-strong)" }}>
              {t(`difficulty.${task.difficulty}`)}
            </Badge>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
