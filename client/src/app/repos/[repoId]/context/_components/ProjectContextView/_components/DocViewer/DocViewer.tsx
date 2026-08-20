/* DocViewer — the right pane: rendered document body (read-only, D1), the
   Document/Skills/Agents tabs, and the "Used by N agents" header (D2, R2).
   No Preview/Edit toggle: "Open on GitHub" is the way out to an editor (D1). */
"use client";

import React from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge, Markdown, Tabs } from "@devdigest/ui";
import type { AgentSkillLink, ProjectContextDoc } from "@devdigest/shared";
import { api } from "@/lib/api";
import { useAgents } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { useProjectContextDoc } from "@/lib/hooks/core";
import { usedByAgentIds } from "../AttachTabs/helpers";
import { SkillsTab } from "../AttachTabs/SkillsTab";
import { AgentsTab } from "../AttachTabs/AgentsTab";
import { MAX_ATTACH_SIZE_KB } from "../../constants";
import { s } from "./styles";

type TabKey = "document" | "skills" | "agents";

export function DocViewer({
  repoId,
  docs,
  selectedPath,
}: {
  repoId: string;
  docs: ProjectContextDoc[];
  selectedPath: string | null;
}) {
  const t = useTranslations("context");

  const docMeta = selectedPath ? docs.find((d) => d.path === selectedPath) : undefined;

  if (!selectedPath) {
    return <div style={s.placeholder}>{t("doc.selectPrompt")}</div>;
  }

  if (!docMeta) {
    return (
      <div style={s.placeholder}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("states.notFound.title")}</div>
        <div>{t("states.notFound.body", { path: selectedPath })}</div>
      </div>
    );
  }

  // Keyed on the path: switching documents mounts a fresh body rather than
  // resetting the active tab from an effect, so a document deep-link or a
  // rail click always lands back on the Document tab without a
  // set-state-in-effect render cascade.
  return <DocViewerBody key={selectedPath} repoId={repoId} docMeta={docMeta} />;
}

function DocViewerBody({ repoId, docMeta }: { repoId: string; docMeta: ProjectContextDoc }) {
  const t = useTranslations("context");
  const [tab, setTab] = React.useState<TabKey>("document");

  const { data: agents } = useAgents();
  const { data: skills } = useSkills();
  const { data: detail, isLoading, isError } = useProjectContextDoc(repoId, docMeta.path);

  const skillLinkQueries = useQueries({
    queries: (agents ?? []).map((agent) => ({
      queryKey: ["agent-skills", agent.id],
      queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agent.id}/skills`),
      enabled: !!detail && detail.attachments.some((a) => a.target_kind === "skill"),
    })),
  });

  const attachments = detail?.attachments ?? [];
  const skillById = new Map((skills ?? []).map((sk) => [sk.id, sk]));
  const usedCount = usedByAgentIds(
    agents ?? [],
    attachments,
    skillLinkQueries.map((q) => q.data),
    skillById,
  ).size;
  // Only the size ceiling blocks the toggle (C4). A missing document stays
  // toggleable so it can be detached, or re-attached if a rename brings it
  // back (R10, C8): "the tabs stay usable, so the user can detach".
  const attachDisabled = docMeta.too_large;

  return (
    <div>
      <div style={s.header}>
        <span className="mono" style={s.path}>
          {docMeta.path}
        </span>
        {docMeta.missing ? (
          <Badge color="var(--crit)" bg="var(--crit-bg)">
            {t("rail.missingBadge")}
          </Badge>
        ) : (
          <button type="button" style={s.usedBy} onClick={() => setTab("agents")}>
            {t("doc.usedByAgents", { count: usedCount })}
          </button>
        )}
        {!docMeta.missing && detail?.github_url && (
          <a href={detail.github_url} target="_blank" rel="noreferrer" className="mono">
            {t("doc.openOnGithub")}
          </a>
        )}
      </div>

      {docMeta.too_large && <div style={s.warning}>{t("attach.tooLarge", { limit: MAX_ATTACH_SIZE_KB })}</div>}

      <Tabs
        tabs={[
          { key: "document", label: t("doc.tabs.document") },
          { key: "skills", label: t("doc.tabs.skills") },
          { key: "agents", label: t("doc.tabs.agents") },
        ]}
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        pad="0 16px"
      />

      {tab === "document" &&
        (docMeta.missing ? (
          <div style={s.placeholder}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("states.missingDoc.title")}</div>
            <div>{t("states.missingDoc.body", { path: docMeta.path })}</div>
          </div>
        ) : isLoading ? (
          <div style={s.body}>…</div>
        ) : isError || !detail ? (
          <div style={s.placeholder}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("states.docLoadError.title")}</div>
            <div>{t("states.docLoadError.body")}</div>
          </div>
        ) : (
          <div style={s.body}>
            <Markdown>{detail.content}</Markdown>
          </div>
        ))}

      {tab === "skills" && (
        <SkillsTab repoId={repoId} path={docMeta.path} attachments={attachments} disabled={attachDisabled} />
      )}

      {tab === "agents" && (
        <AgentsTab
          repoId={repoId}
          path={docMeta.path}
          attachments={attachments}
          agents={agents ?? []}
          skillLinksByAgent={skillLinkQueries.map((q) => q.data)}
          skillById={skillById}
          disabled={attachDisabled}
        />
      )}
    </div>
  );
}
