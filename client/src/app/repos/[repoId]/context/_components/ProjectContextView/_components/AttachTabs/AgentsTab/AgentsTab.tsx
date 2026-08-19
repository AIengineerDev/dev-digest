/* AgentsTab — one document's per-agent attach toggle (specs/09-project-context.md
   R2, R6, D2, C9, C14). An agent that reads this document only through a
   linked skill is shown with a note, not a separate toggle — the toggle here
   always means "attached to this agent directly"; the dedup that backs the
   header's "Used by N agents" lives in `usedByAgentIds` (./helpers) and is
   computed once by DocViewer, not re-fetched per tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle } from "@devdigest/ui";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import { useSetContextAttachments } from "@/lib/hooks/core";
import { isAttached, toggleTarget, type AttachmentTarget } from "../helpers";
import { s } from "../styles";

export function AgentsTab({
  repoId,
  path,
  attachments,
  agents,
  skillLinksByAgent,
  skillById,
  disabled,
}: {
  repoId: string;
  path: string;
  attachments: AttachmentTarget[];
  agents: Agent[];
  /** `agents[i]`'s linked skills, `undefined` while still loading. */
  skillLinksByAgent: Array<AgentSkillLink[] | undefined>;
  skillById: Map<string, Skill>;
  disabled?: boolean;
}) {
  const t = useTranslations("context");
  const setAttachments = useSetContextAttachments(repoId);
  const [errorFor, setErrorFor] = React.useState<string | null>(null);

  const attachedSkillIds = new Set(
    attachments.filter((a) => a.target_kind === "skill").map((a) => a.target_id),
  );

  if (agents.length === 0) {
    return <div style={s.empty}>{t("attach.emptyAgents")}</div>;
  }

  const pending = setAttachments.isPending && setAttachments.variables?.path === path;

  const toggle = (agentId: string, on: boolean) => {
    if (disabled || pending) return;
    setErrorFor(null);
    setAttachments.mutate(
      { path, targets: toggleTarget(attachments, "agent", agentId, on) },
      { onError: () => setErrorFor(agentId) },
    );
  };

  return (
    <div style={s.list}>
      {agents.map((agent, i) => {
        const direct = isAttached(attachments, "agent", agent.id);
        const viaSkill = viaSkillNames(skillLinksByAgent[i], attachedSkillIds, skillById);
        return (
          <div key={agent.id} style={s.row}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.name}>{agent.name}</div>
              {viaSkill.map((name) => (
                <div key={name} style={s.note}>
                  {t("attach.viaSkillLabel", { name })}
                </div>
              ))}
            </div>
            {errorFor === agent.id && <span style={s.note}>{t("attach.saveError")}</span>}
            <span
              role="group"
              aria-label={t("attach.toggleLabel", { path, name: agent.name })}
              style={{ opacity: disabled || pending ? 0.5 : 1, pointerEvents: disabled || pending ? "none" : "auto" }}
            >
              <Toggle on={direct} onChange={(v) => toggle(agent.id, v)} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function viaSkillNames(
  links: AgentSkillLink[] | undefined,
  attachedSkillIds: Set<string>,
  skillById: Map<string, Skill>,
): string[] {
  if (!links) return [];
  const names: string[] = [];
  for (const link of links) {
    if (!attachedSkillIds.has(link.skill_id)) continue;
    const skill = skillById.get(link.skill_id);
    if (skill) names.push(skill.name);
  }
  return names;
}
