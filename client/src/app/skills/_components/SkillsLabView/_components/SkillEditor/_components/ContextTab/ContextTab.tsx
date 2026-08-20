/* ContextTab — attach THIS skill to project-context documents (a deliberate,
   skill-scoped reversal of specs/09-project-context.md D2, authorised for
   skills only — see the PR brief). D2's own worry — two UIs disagreeing about
   one piece of state — is why this reads and writes through the exact same
   endpoints and query keys as the document-side
   ProjectContextView/_components/AttachTabs/SkillsTab: no second cache, no
   optimistic guess, invalidation only.

   Skills are workspace-scoped; project-context documents are repo-scoped. The
   editor has no repoId of its own (no /skills/:id/:repoId route), so this
   reads the app's one active-repo state (`useActiveRepo`, the same source the
   shell's repo switcher drives) instead of inventing a second repo picker
   that could disagree with it. */
"use client";

import React from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Skeleton, Toggle } from "@devdigest/ui";
import type { ProjectContextDocDetail } from "@devdigest/shared";
import { api } from "@/lib/api";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles, useSetContextAttachments } from "@/lib/hooks/core";
import { SKELETON_ROWS } from "./constants";
import { isAttached, nextTargets } from "./helpers";
import { s } from "./styles";

export function ContextTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const filesQuery = useContextFiles(repoId);
  const setAttachments = useSetContextAttachments(repoId);
  const [errorFor, setErrorFor] = React.useState<string | null>(null);

  const docs = filesQuery.data?.docs ?? [];

  // One detail query per document, keyed exactly like
  // hooks/core.ts:useProjectContextDoc — so a document opened from the
  // Project Context page shares this same cache entry, and
  // useSetContextAttachments' invalidation of ["context-doc", repoId, path]
  // (core.ts) refreshes it here too.
  const detailQueries = useQueries({
    queries: docs.map((doc) => ({
      queryKey: ["context-doc", repoId, doc.path],
      queryFn: () =>
        api.get<ProjectContextDocDetail>(`/repos/${repoId}/context/doc?path=${encodeURIComponent(doc.path)}`),
      enabled: !!repoId,
    })),
  });

  if (reposLoaded && !repoId) {
    return <div style={s.empty}>{t("context.noRepo")}</div>;
  }

  if (!reposLoaded || filesQuery.isLoading) {
    return (
      <div style={s.list} aria-busy="true" aria-label={t("context.loading")}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} style={s.skeletonRow} />
        ))}
      </div>
    );
  }

  if (filesQuery.isError) {
    return <ErrorState body={t("context.loadError")} onRetry={() => void filesQuery.refetch()} />;
  }

  if (docs.length === 0) {
    return <EmptyState icon="FileText" title={t("context.emptyTitle")} body={t("context.emptyBody")} />;
  }

  const toggle = (path: string, detail: ProjectContextDocDetail | undefined, on: boolean) => {
    // The document's OWN full attachment set must be known before writing —
    // see helpers.ts:nextTargets. Guarded again here in case a fast click
    // beats the row's own disabled state.
    if (!detail) return;
    setErrorFor(null);
    setAttachments.mutate(
      { path, targets: nextTargets(detail.attachments, skillId, on) },
      { onError: () => setErrorFor(path) },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.repoNote}>{t("context.repoLabel", { name: activeRepo?.full_name ?? "" })}</div>
      <div style={s.list}>
        {docs.map((doc, i) => {
          const query = detailQueries[i];
          const detail = query?.data;
          const rowLoading = !detail && !query?.isError;
          const pending = setAttachments.isPending && setAttachments.variables?.path === doc.path;
          const disabled = doc.too_large || rowLoading || !!query?.isError || pending;
          const on = detail ? isAttached(detail.attachments, skillId) : false;

          return (
            <div key={doc.path} style={s.row}>
              <span className="mono" style={s.path}>
                {doc.path}
              </span>
              {doc.missing && (
                <Badge color="var(--crit)" bg="var(--crit-bg)">
                  {t("context.missing")}
                </Badge>
              )}
              {doc.too_large && <span style={s.note}>{t("context.tooLarge")}</span>}
              {!doc.too_large && query?.isError && <span style={s.note}>{t("context.rowLoadError")}</span>}
              {errorFor === doc.path && <span style={s.note}>{t("context.saveError")}</span>}
              <span
                role="group"
                aria-label={t("context.toggleLabel", { path: doc.path })}
                style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" }}
              >
                <Toggle on={on} onChange={(v) => toggle(doc.path, detail, v)} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
