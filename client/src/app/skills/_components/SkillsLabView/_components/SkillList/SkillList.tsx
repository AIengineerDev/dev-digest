/* SkillList — left pane: search, "Add Skill" menu, and one row per skill.
   Presentational: every piece of data and every mutation is handed down from
   SkillsLabView, which owns the query. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import type { AddSkillTab } from "../AddSkillModal";
import { SkillListItem } from "./_components/SkillListItem";
import { MENU_WIDTH, SKELETON_ROW_HEIGHT } from "./constants";
import { s } from "./styles";

export interface SkillListProps {
  skills: Skill[];
  activeId: string | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  /** Opens the Add-skill modal on the tab the menu entry names. */
  onCreate: (tab: AddSkillTab) => void;
}

export function SkillList({
  skills,
  activeId,
  isLoading,
  isError,
  onRetry,
  search,
  onSearch,
  onSelect,
  onToggle,
  onCreate,
}: SkillListProps) {
  const t = useTranslations("skills");

  // Only community search is still inert: it needs a registry. File and URL
  // import shipped once the untrusted-source story from specs/02-skills.md was
  // in place, and each opens the modal on its own tab.
  const comingSoon = t("lab.menu.comingSoon");

  return (
    <div style={s.pane}>
      <div style={s.header}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>{t("lab.heading")}</h1>
          <Dropdown
            width={MENU_WIDTH}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("lab.addSkill")}
              </Button>
            }
            items={[
              { label: t("lab.menu.fromFile"), icon: "Upload", onClick: () => onCreate("file") },
              { label: t("lab.menu.fromUrl"), icon: "Link", onClick: () => onCreate("url") },
              { label: t("lab.menu.community"), icon: "Globe", muted: true, hint: comingSoon },
              { divider: true },
              {
                label: t("lab.menu.createFromScratch"),
                icon: "Edit",
                onClick: () => onCreate("create"),
              },
            ]}
          />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("lab.searchPlaceholder")}
            aria-label={t("lab.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <div style={s.body}>
        {isLoading && (
          <div style={s.skeletons}>
            <Skeleton height={SKELETON_ROW_HEIGHT} />
            <Skeleton height={SKELETON_ROW_HEIGHT} />
            <Skeleton height={SKELETON_ROW_HEIGHT} />
          </div>
        )}
        {/* A failed load is an error, never an empty list. */}
        {isError && <ErrorState body={t("lab.loadError")} onRetry={onRetry} />}
        {!isLoading && !isError && skills.length === 0 && search.trim() !== "" && (
          <EmptyState icon="Search" title={t("lab.noMatchTitle")} body={t("lab.noMatchBody")} />
        )}
        {!isLoading && !isError && skills.length === 0 && search.trim() === "" && (
          <EmptyState
            icon="FileText"
            title={t("lab.emptyTitle")}
            body={t("lab.emptyBody")}
            cta={t("lab.emptyCta")}
            onCta={() => onCreate("create")}
          />
        )}
        {!isLoading &&
          !isError &&
          skills.map((skill) => (
            <SkillListItem
              key={skill.id}
              skill={skill}
              active={skill.id === activeId}
              onClick={() => onSelect(skill.id)}
              onToggle={(enabled) => onToggle(skill.id, enabled)}
            />
          ))}
      </div>
    </div>
  );
}
