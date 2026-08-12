/* SkillsTab — every workspace skill, with an on/off for THIS agent.

   Two queries feed it: the workspace skill list and this agent's ordered links.
   Both loading and error states are handled beside them — a failed load must
   never fall through to "no skills yet", which would invite someone to create a
   duplicate of a skill they already have (same reasoning as RunReviewDropdown).

   Order is the product feature, not decoration: `skill_ids` order IS the order
   the bodies appear in under `## Skills / rules` in the assembled prompt. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, EmptyState, Icon, Skeleton, TextInput } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../../../lib/api";
import { DRAG_MIME, SKELETON_ROWS, SKILL_TYPE_COLOR } from "./constants";
import {
  buildOrder,
  canToggle,
  filterSkills,
  linkedIds,
  moveBefore,
  sortByOrder,
  toSkillIds,
} from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const skillsQuery = useSkills();
  const linksQuery = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  const [query, setQuery] = React.useState("");
  const [order, setOrder] = React.useState<string[]>([]);
  const [linked, setLinked] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const [dragId, setDragId] = React.useState<string | null>(null);

  const skills = skillsQuery.data;
  const links = linksQuery.data;

  // Re-seed local state whenever the server's view changes (first load, agent
  // switch, a skill created in the Lab). Keyed on the ids + their order so a
  // refetch that returns the same data does not clobber an in-flight edit.
  const signature = React.useMemo(
    () =>
      skills && links
        ? `${agent.id}|${skills.map((k) => `${k.id}:${k.enabled}`).join(",")}|${links
            .map((l) => l.skill_id)
            .join(",")}`
        : null,
    [agent.id, skills, links],
  );
  React.useEffect(() => {
    if (!skills || !links) return;
    setOrder(buildOrder(skills, links));
    setLinked(linkedIds(links));
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const revert = React.useCallback(() => {
    if (!skills || !links) return;
    setOrder(buildOrder(skills, links));
    setLinked(linkedIds(links));
  }, [skills, links]);

  const persist = (nextOrder: string[], nextLinked: ReadonlySet<string>) => {
    setOrder(nextOrder);
    setLinked(nextLinked);
    setSkills.mutate(
      { agentId: agent.id, skillIds: toSkillIds(nextOrder, nextLinked) },
      // The write failed, so the optimistic UI is now a lie — put the server's
      // truth back rather than leaving a toggle that looks saved.
      { onError: revert },
    );
  };

  const toggle = (skill: Skill) => {
    const next = !linked.has(skill.id);
    if (!canToggle(skill, next)) return;
    const nextLinked = new Set(linked);
    if (next) nextLinked.add(skill.id);
    else nextLinked.delete(skill.id);
    persist(order, nextLinked);
  };

  const reorder = (dragged: string, over: string) => {
    const next = moveBefore(order, dragged, over);
    if (next === order) return;
    persist(next, linked);
  };

  // ---- loading / error, beside the queries -------------------------------
  if (skillsQuery.isLoading || linksQuery.isLoading) {
    return (
      <div style={s.wrap}>
        <div style={s.header}>
          <h2 style={s.h2}>{t("skills.title")}</h2>
        </div>
        <div style={s.list} aria-busy="true" aria-label={t("skills.loading")}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} style={s.skeletonRow} />
          ))}
        </div>
      </div>
    );
  }

  if (skillsQuery.isError || linksQuery.isError || !skills || !links) {
    const err = skillsQuery.error ?? linksQuery.error;
    return (
      <div style={s.wrap}>
        <ErrorState
          title={t("skills.loadErrorTitle")}
          body={err instanceof ApiError ? err.message : t("skills.loadErrorBody")}
          onRetry={() => {
            void skillsQuery.refetch();
            void linksQuery.refetch();
          }}
        />
      </div>
    );
  }

  const linkedCount = toSkillIds(order, linked).length;
  const visible = sortByOrder(filterSkills(skills, query), order);
  // Reordering a filtered list would move a row past neighbours it cannot see,
  // so dragging is off while a filter is active. The hint says so.
  const dragEnabled = query.trim() === "";

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: linkedCount, total: skills.length })}
        </Badge>
        {setSkills.isPending && <span style={s.savingNote}>{t("skills.saving")}</span>}
        <div style={s.filter}>
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
          />
        </div>
      </div>
      <p style={s.hint}>{dragEnabled ? t("skills.orderHint") : t("skills.orderHintFiltered")}</p>

      {skills.length === 0 ? (
        <EmptyState
          icon="Sparkles"
          title={t("skills.emptyTitle")}
          body={t("skills.emptyBody")}
        />
      ) : visible.length === 0 ? (
        <p style={s.hint}>{t("skills.noMatches", { query })}</p>
      ) : (
        <div style={s.list} role="list">
          {visible.map((skill) => {
            const on = linked.has(skill.id);
            const globallyOff = !skill.enabled;
            // A globally disabled skill enters no prompt, so it can never be
            // turned ON here — same treatment the run dropdown gives a
            // disabled agent: visible, labelled, not selectable.
            const locked = globallyOff && !on;
            const color = SKILL_TYPE_COLOR[skill.type];
            return (
              <div
                key={skill.id}
                role="listitem"
                aria-label={skill.name}
                draggable={dragEnabled}
                onDragStart={(e) => {
                  if (!dragEnabled) return;
                  setDragId(skill.id);
                  e.dataTransfer.setData(DRAG_MIME, skill.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => {
                  if (dragEnabled) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!dragEnabled) return;
                  e.preventDefault();
                  const dragged = e.dataTransfer.getData(DRAG_MIME) || dragId;
                  if (dragged) reorder(dragged, skill.id);
                  setDragId(null);
                }}
                style={s.row(on, globallyOff, dragId === skill.id)}
              >
                <button
                  type="button"
                  aria-label={t("skills.reorderHandle", { name: skill.name })}
                  disabled={!dragEnabled}
                  style={s.handle(dragEnabled)}
                  // Drag is mouse-only; the arrow keys give the same reorder to
                  // keyboard users (and are what the test drives).
                  onKeyDown={(e) => {
                    if (!dragEnabled) return;
                    const i = order.indexOf(skill.id);
                    if (i < 0) return;
                    const neighbour =
                      e.key === "ArrowUp" ? order[i - 1] : e.key === "ArrowDown" ? order[i + 1] : undefined;
                    if (!neighbour) return;
                    e.preventDefault();
                    reorder(skill.id, neighbour);
                  }}
                >
                  <Icon.Menu size={14} />
                </button>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={locked}
                  aria-label={skill.name}
                  title={locked ? t("skills.globallyDisabledHint") : undefined}
                  onClick={() => toggle(skill)}
                  style={s.check(on, locked)}
                >
                  {on && <Icon.Check size={11} style={{ color: "#fff" }} />}
                </button>
                <span className="mono" style={s.name}>
                  {skill.name}
                </span>
                {globallyOff && <span style={s.disabledTag}>{t("skills.globallyDisabled")}</span>}
                <span style={s.typeBadge(color)}>{skill.type}</span>
              </div>
            );
          })}
        </div>
      )}

      {setSkills.isError && (
        <div style={s.hint} role="alert">
          {t("skills.saveError")}{" "}
          <Button kind="secondary" size="sm" onClick={() => void linksQuery.refetch()}>
            {t("skills.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
