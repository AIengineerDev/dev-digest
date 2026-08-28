/* SkillEditor — centre pane: the skill body as monospace Markdown, an "unsaved"
   badge, Save, and a live character count against the per-skill limit. Saving
   over the limit is blocked here with the limit named, matching the server's
   rejection rather than discovering it on the round-trip. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import { useDeleteSkill, useSkill, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { MAX_SKILL_BODY_CHARS } from "../../constants";
import { EvalsTab } from "./_components/EvalsTab";
import { ContextTab } from "./_components/ContextTab";
import { currentBody, isDirty, isOverLimit } from "./helpers";
import { s } from "./styles";

type EditorTab = "body" | "context" | "evals";

export function SkillEditor({ id }: { id: string }) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, refetch } = useSkill(id);
  const update = useUpdateSkill();
  const remove = useDeleteSkill();
  // null = untouched; the saved body is then rendered directly, so a refetch is
  // reflected without mirroring server state into local state.
  const [draft, setDraft] = React.useState<string | null>(null);
  // Local, not URL-lifted (mirrors ProjectContextView's DocViewerBody, not
  // AgentEditor's ?tab=): SkillsLabView already remounts this component on
  // selection via `key={selectedId}`, so a skill switch resets the tab for
  // free and no route plumbing is needed for a still-shareable deep link.
  const [tab, setTab] = React.useState<EditorTab>("body");

  if (isLoading) {
    return (
      <div style={s.pane}>
        <div style={s.skeleton}>
          <Skeleton height={20} width={200} />
          <Skeleton height={320} />
        </div>
      </div>
    );
  }

  if (isError || !skill) {
    return (
      <div style={s.pane}>
        <ErrorState body={t("editor.loadError")} onRetry={() => void refetch()} />
      </div>
    );
  }

  const body = currentBody(draft, skill.body);
  const dirty = isDirty(draft, skill.body);
  const over = isOverLimit(body, MAX_SKILL_BODY_CHARS);

  const save = () => {
    if (over || !dirty || update.isPending) return;
    update.mutate({ id: skill.id, patch: { body } }, { onSuccess: () => setDraft(null) });
  };

  const del = () => {
    if (!window.confirm(t("editor.deleteConfirm", { name: skill.name }))) return;
    remove.mutate(skill.id);
  };

  return (
    <div style={s.pane}>
      <div style={s.header}>
        <Icon.FileText size={14} style={s.headerIcon} />
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <Badge color="var(--text-secondary)" mono>
          {t("editor.version", { version: skill.version })}
        </Badge>
        {!skill.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
        {dirty && <Badge color="var(--text-muted)">{t("editor.unsaved")}</Badge>}
        <div style={s.actions}>
          {tab === "body" && (
            <span className="mono tnum" style={s.count(over)}>
              {t("editor.count", { count: body.length, limit: MAX_SKILL_BODY_CHARS })}
            </span>
          )}
          <Button kind="ghost" size="sm" icon="Trash" onClick={del} disabled={remove.isPending}>
            {t("editor.delete")}
          </Button>
          {tab === "body" && (
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              onClick={save}
              disabled={over || !dirty || update.isPending}
            >
              {update.isPending ? t("editor.saving") : t("editor.save")}
            </Button>
          )}
        </div>
      </div>

      <Tabs
        tabs={[
          { key: "body", label: t("editor.tabs.body") },
          { key: "context", label: t("editor.tabs.context") },
          { key: "evals", label: t("editor.tabs.evals") },
        ]}
        value={tab}
        onChange={(k) => setTab(k as EditorTab)}
        pad="0 14px"
      />

      {tab === "body" ? (
        <>
          <textarea
            className="mono"
            value={body}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("editor.bodyPlaceholder")}
            aria-label={skill.name}
            spellCheck={false}
            style={s.textarea}
          />

          {over && (
            <div role="alert" style={s.limitError}>
              {t("editor.overLimit", { count: body.length, limit: MAX_SKILL_BODY_CHARS })}
            </div>
          )}
          {update.isError && (
            <div role="alert" style={s.limitError}>
              {t("editor.saveError")}
            </div>
          )}
        </>
      ) : tab === "context" ? (
        <ContextTab skillId={skill.id} />
      ) : (
        <EvalsTab skillId={skill.id} />
      )}
    </div>
  );
}
