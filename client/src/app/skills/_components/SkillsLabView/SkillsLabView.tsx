/* /skills — Skills Lab (spec 02-skills, phase 5). Two panes: the skill list and
   the body editor. The mock's third pane (eval) needs an eval engine we do not
   have, so it is absent rather than faked. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { SkillEditor } from "./_components/SkillEditor";
import { SkillList } from "./_components/SkillList";
import { SELECTED_PARAM } from "./constants";
import { filterSkills, resolveSelectedId } from "./helpers";
import { s } from "./styles";

export function SkillsLabView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const list = filterSkills(skills ?? [], search);
  const selectedId = resolveSelectedId(list, params?.get(SELECTED_PARAM) ?? null);

  const select = (id: string) => {
    const sp = new URLSearchParams(params?.toString() ?? "");
    sp.set(SELECTED_PARAM, id);
    router.replace(`/skills?${sp.toString()}`);
  };

  return (
    <AppShell crumb={[{ label: t("lab.crumbLab") }, { label: t("lab.crumbSkills") }]}>
      {creating && (
        <CreateSkillModal onClose={() => setCreating(false)} onCreated={(id) => select(id)} />
      )}
      <div style={s.panes}>
        <SkillList
          skills={list}
          activeId={selectedId}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          search={search}
          onSearch={setSearch}
          onSelect={select}
          onToggle={(id, enabled) => update.mutate({ id, patch: { enabled } })}
          onCreate={() => setCreating(true)}
        />
        <div style={s.centre}>
          {isLoading && (
            <div style={s.centreSkeleton}>
              <Skeleton height={24} width={240} />
              <Skeleton height={320} />
            </div>
          )}
          {!isLoading && !isError && selectedId && (
            // Remount on selection so the editor's draft never leaks between skills.
            <SkillEditor key={selectedId} id={selectedId} />
          )}
          {!isLoading && !isError && !selectedId && (
            <div style={s.centrePlaceholder}>
              <EmptyState
                icon="FileText"
                title={t("lab.selectTitle")}
                body={t("lab.selectBody")}
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
