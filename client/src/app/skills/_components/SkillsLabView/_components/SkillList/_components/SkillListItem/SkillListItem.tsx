/* SkillListItem — one row of the Skills Lab list: name, description, enable
   toggle, type badge and source badge. Purely presentational. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import {
  BADGE_BG_ALPHA,
  SKILL_SOURCE_ICON,
  SKILL_TYPE_COLOR,
  TOGGLE_SIZE,
} from "./constants";
import { s } from "./styles";

export interface SkillListItemProps {
  skill: Skill;
  active: boolean;
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
}

export function SkillListItem({ skill, active, onClick, onToggle }: SkillListItemProps) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type];
  const SourceIcon = Icon[SKILL_SOURCE_ICON[skill.source]];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={s.row(active, skill.enabled)}
    >
      <div style={s.top}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle on={skill.enabled} onChange={onToggle} size={TOGGLE_SIZE} />
        </span>
      </div>
      <div style={s.description}>{skill.description || t("listItem.noDescription")}</div>
      <div style={s.badges}>
        <span style={s.typeBadge(color, color + BADGE_BG_ALPHA)}>
          {t(`listItem.type.${skill.type}`)}
        </span>
        <span style={s.sourceBadge}>
          <SourceIcon size={11} />
          {t(`listItem.source.${skill.source}`)}
        </span>
      </div>
    </div>
  );
}
