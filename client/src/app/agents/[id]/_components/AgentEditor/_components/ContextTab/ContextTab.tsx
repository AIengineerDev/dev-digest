/* ContextTab — attach THIS agent to project-context documents, from the
   agent's own editor. A deliberate, agent-scoped reversal of
   specs/09-project-context.md D2 (course requirement, CTO-authorised — see
   the PR brief in `agents/:id?tab=context`'s task). D2's own worry — two UIs
   disagreeing about one piece of state — is why this reads and writes through
   the exact same endpoints and query keys as the document-side
   ProjectContextView/_components/AttachTabs/AgentsTab and the skill-scoped
   sibling `SkillEditor/_components/ContextTab`: no second cache, no
   optimistic guess, invalidation only.

   Agents are workspace-scoped; project-context documents are repo-scoped. The
   editor has no repoId of its own (no /agents/:id/:repoId route), so this
   reads the app's one active-repo state (`useActiveRepo`) instead of
   inventing a second repo picker that could disagree with it
   (client/INSIGHTS.md, 2026-08-19).

   No drag-reorder: `PUT /repos/:id/context/attachments` computes `order`
   server-side as a per-target append
   (`server/src/modules/project-context/service.ts:130-134`), and neither
   client-reachable read endpoint returns it back —
   `ProjectContextDocDetail.attachments` is `{target_kind, target_id}` only
   (`@devdigest/shared` `contracts/platform.ts:299-307`). A row dragged here
   could not be read back after a reload, and re-submitting a document's
   target set to force a new append-order would also silently reorder every
   OTHER target sharing that document (the order recompute runs once per
   target in the submitted list, not just the one being reordered) — the same
   class of cross-actor corruption D2 exists to prevent. Rows are shown
   path-sorted, matching the server's own list order. */
"use client";

import React from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge, EmptyState, ErrorState, Icon, Skeleton, TextInput, Toggle } from "@devdigest/ui";
import type { Agent, ProjectContextDocDetail } from "@devdigest/shared";
import { api } from "@/lib/api";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles, useSetContextAttachments } from "@/lib/hooks/core";
import { CATEGORY_COLOR, SKELETON_ROWS } from "./constants";
import { categoryForPath, directoryOf, filenameOf, filterDocs, isAttached, nextTargets } from "./helpers";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const filesQuery = useContextFiles(repoId);
  const setAttachments = useSetContextAttachments(repoId);
  const [query, setQuery] = React.useState("");
  const [errorFor, setErrorFor] = React.useState<string | null>(null);

  const docs = React.useMemo(() => [...(filesQuery.data?.docs ?? [])].sort((a, b) => a.path.localeCompare(b.path)), [
    filesQuery.data,
  ]);
  const visible = filterDocs(docs, query);

  // One detail query per document, keyed exactly like
  // hooks/core.ts:useProjectContextDoc — so a document opened from the
  // Project Context page or the skill editor's own Context tab shares this
  // same cache entry, and useSetContextAttachments' invalidation of
  // ["context-doc", repoId, path] refreshes it here too.
  const detailQueries = useQueries({
    queries: docs.map((doc) => ({
      queryKey: ["context-doc", repoId, doc.path],
      queryFn: () =>
        api.get<ProjectContextDocDetail>(`/repos/${repoId}/context/doc?path=${encodeURIComponent(doc.path)}`),
      enabled: !!repoId,
    })),
  });
  const detailByPath = new Map(docs.map((doc, i) => [doc.path, detailQueries[i]?.data]));
  const queryByPath = new Map(docs.map((doc, i) => [doc.path, detailQueries[i]]));

  if (reposLoaded && !repoId) {
    return <div style={s.empty}>{t("context.noRepo")}</div>;
  }

  if (!reposLoaded || filesQuery.isLoading) {
    return (
      <div style={s.wrap}>
        <div style={s.list} aria-busy="true" aria-label={t("context.loading")}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} style={s.skeletonRow} />
          ))}
        </div>
      </div>
    );
  }

  if (filesQuery.isError) {
    return <ErrorState body={t("context.loadError")} onRetry={() => void filesQuery.refetch()} />;
  }

  if (docs.length === 0) {
    return <EmptyState icon="FileText" title={t("context.emptyTitle")} body={t("context.emptyBody")} />;
  }

  const attachedCount = docs.filter((doc) => isAttached(detailByPath.get(doc.path)?.attachments ?? [], agent.id))
    .length;

  const toggle = (path: string, detail: ProjectContextDocDetail | undefined, on: boolean) => {
    // The document's OWN full attachment set must be known before writing —
    // see helpers.ts:nextTargets. Guarded again here in case a fast click
    // beats the row's own disabled state.
    if (!detail) return;
    setErrorFor(null);
    setAttachments.mutate(
      { path, targets: nextTargets(detail.attachments, agent.id, on) },
      { onError: () => setErrorFor(path) },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.heading")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("context.attachedCount", { attached: attachedCount, total: docs.length })}
        </Badge>
        <div style={s.filter}>
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder={t("context.filterPlaceholder")}
            aria-label={t("context.filterPlaceholder")}
          />
        </div>
      </div>
      <p style={s.explanation}>{t("context.explanation")}</p>
      {activeRepo && <div style={s.repoNote}>{t("context.repoLabel", { name: activeRepo.full_name })}</div>}

      {visible.length === 0 ? (
        <p style={s.hint}>{t("context.noMatches", { query })}</p>
      ) : (
        <div style={s.list}>
          {visible.map((doc) => {
            const detail = detailByPath.get(doc.path);
            const rowQuery = queryByPath.get(doc.path);
            const rowLoading = !detail && !rowQuery?.isError;
            const pending = setAttachments.isPending && setAttachments.variables?.path === doc.path;
            const disabled = doc.too_large || rowLoading || !!rowQuery?.isError || pending;
            const on = detail ? isAttached(detail.attachments, agent.id) : false;
            const category = categoryForPath(doc.path);
            const dir = directoryOf(doc.path);

            return (
              <div key={doc.path} style={s.row}>
                <span
                  role="group"
                  aria-label={t("context.toggleLabel", { path: doc.path })}
                  style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" }}
                >
                  <Toggle on={on} onChange={(v) => toggle(doc.path, detail, v)} />
                </span>
                <div style={s.pathWrap}>
                  <span className="mono" style={s.filename}>
                    {filenameOf(doc.path)}
                  </span>
                  {dir && (
                    <span className="mono" style={s.directory}>
                      {dir}
                    </span>
                  )}
                </div>
                {doc.missing && (
                  <Badge color="var(--crit)" bg="var(--crit-bg)">
                    {t("context.missing")}
                  </Badge>
                )}
                {doc.too_large && <span style={s.note}>{t("context.tooLarge")}</span>}
                {!doc.too_large && rowQuery?.isError && <span style={s.note}>{t("context.rowLoadError")}</span>}
                {errorFor === doc.path && <span style={s.note}>{t("context.saveError")}</span>}
                <span style={s.categoryBadge(CATEGORY_COLOR[category])}>{t(`context.categories.${category}`)}</span>
                <span className="tnum" style={s.tokens}>
                  {doc.tokens == null ? "" : t("context.tokens", { tokens: doc.tokens })}
                </span>
                {repoId && (
                  <Link
                    href={`/repos/${repoId}/context?path=${encodeURIComponent(doc.path)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={s.preview}
                    aria-label={t("context.previewLabel", { path: doc.path })}
                  >
                    <Icon.ExternalLink size={12} />
                    {t("context.preview")}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
