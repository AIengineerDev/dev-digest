/* SkillsTab — one document's per-skill attach toggle (specs/09-project-context.md
   R2, C9). Pessimistic: the toggle reflects server state, never an optimistic
   guess, so a failed write never claims an attachment that did not persist. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle } from "@devdigest/ui";
import { useSkills } from "@/lib/hooks/skills";
import { useSetContextAttachments } from "@/lib/hooks/core";
import { isAttached, toggleTarget, type AttachmentTarget } from "../helpers";
import { s } from "../styles";

export function SkillsTab({
  repoId,
  path,
  attachments,
  disabled,
}: {
  repoId: string;
  path: string;
  attachments: AttachmentTarget[];
  /** Attaching is unavailable — over the size ceiling or the document is missing (C4, R10). */
  disabled?: boolean;
}) {
  const t = useTranslations("context");
  const { data: skills } = useSkills();
  const setAttachments = useSetContextAttachments(repoId);
  const [errorFor, setErrorFor] = React.useState<string | null>(null);

  if (!skills || skills.length === 0) {
    return <div style={s.empty}>{t("attach.emptySkills")}</div>;
  }

  const pending = setAttachments.isPending && setAttachments.variables?.path === path;

  const toggle = (skillId: string, on: boolean) => {
    if (disabled || pending) return;
    setErrorFor(null);
    setAttachments.mutate(
      { path, targets: toggleTarget(attachments, "skill", skillId, on) },
      { onError: () => setErrorFor(skillId) },
    );
  };

  return (
    <div style={s.list}>
      {skills.map((skill) => {
        const on = isAttached(attachments, "skill", skill.id);
        return (
          <div key={skill.id} style={s.row}>
            <span style={s.name}>{skill.name}</span>
            {errorFor === skill.id && <span style={s.note}>{t("attach.saveError")}</span>}
            <span
              role="group"
              aria-label={t("attach.toggleLabel", { path, name: skill.name })}
              style={{ opacity: disabled || pending ? 0.5 : 1, pointerEvents: disabled || pending ? "none" : "auto" }}
            >
              <Toggle on={on} onChange={(v) => toggle(skill.id, v)} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
