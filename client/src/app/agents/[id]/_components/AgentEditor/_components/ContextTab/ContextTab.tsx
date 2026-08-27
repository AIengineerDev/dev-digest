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

   Drag-reorder persists through `PUT /repos/:id/context/order`
   (`useSetContextOrder`) — the target-centric counterpart added alongside
   this UI, which writes ONLY this agent's rows and is read back through
   `ProjectContextDocDetail.attachments[].order`. It is deliberately a
   DIFFERENT endpoint from `useSetContextAttachments` (attach/detach): that
   one computes `order` server-side as a per-target append across every
   target on the submitted document, so reusing it for reordering would
   silently reorder a sibling skill's or agent's attachment on the same
   document too (`client/INSIGHTS.md`, 2026-08-25). The local `order` state
   below is the one sanctioned exception to "server state is TanStack Query,
   don't mirror it into useState" (see SkillsTab and the same INSIGHTS entry)
   — it exists only until a drag's write lands, and is reseeded from the
   server on every load via a content signature, never array identity, so an
   idempotent refetch cannot revert an in-flight or just-completed reorder. */
"use client";

import React from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton, TextInput, Toggle } from "@devdigest/ui";
import type { Agent, ProjectContextDocDetail } from "@devdigest/shared";
import { api } from "@/lib/api";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles, useSetContextAttachments, useSetContextOrder } from "@/lib/hooks/core";
import { PreviewPanel } from "./_components/PreviewPanel";
import { CATEGORY_COLOR, DRAG_MIME, SKELETON_ROWS } from "./constants";
import {
  buildDocOrder,
  categoryForPath,
  directoryOf,
  filenameOf,
  filterDocs,
  isAttached,
  moveBefore,
  nextTargets,
  sortByOrder,
  toOrderedPaths,
} from "./helpers";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const filesQuery = useContextFiles(repoId);
  const setAttachments = useSetContextAttachments(repoId);
  const setOrder = useSetContextOrder(repoId);
  const [query, setQuery] = React.useState("");
  const [errorFor, setErrorFor] = React.useState<string | null>(null);
  const [order, setOrderState] = React.useState<string[]>([]);
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const docs = React.useMemo(() => [...(filesQuery.data?.docs ?? [])].sort((a, b) => a.path.localeCompare(b.path)), [
    filesQuery.data,
  ]);

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

  // Reseed `order` whenever the persisted state actually changes (this
  // agent's document set or its per-document order), never on array
  // identity — a refetch that returns the same content must be a no-op, or
  // it would revert a reorder just applied optimistically below. Built as a
  // plain string (not memoised on the dynamic-length `docs` array) so the
  // effect's own dependency list stays a fixed-length `[signature]`.
  const signature = docs
    .map((d) => {
      const row = detailByPath.get(d.path)?.attachments.find(
        (a) => a.target_kind === "agent" && a.target_id === agent.id,
      );
      return `${d.path}:${row ? row.order : "x"}`;
    })
    .join(",");
  React.useEffect(() => {
    setOrderState(buildDocOrder(docs, detailByPath, agent.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

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

  const attachedSet = new Set(
    docs.filter((doc) => isAttached(detailByPath.get(doc.path)?.attachments ?? [], agent.id)).map((d) => d.path),
  );
  const attachedCount = attachedSet.size;
  // Reordering a filtered list would move a row past neighbours it cannot
  // see, so dragging is off while a filter is active — same rule as
  // SkillsTab, and the hint below says so.
  const dragEnabled = query.trim() === "";
  const visible = sortByOrder(filterDocs(docs, query), order);

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

  const reorder = (draggedPath: string, overPath: string) => {
    const next = moveBefore(order, draggedPath, overPath);
    if (next === order) return;
    const prev = order;
    setOrderState(next);
    setOrder.mutate(
      { target_kind: "agent", target_id: agent.id, paths: toOrderedPaths(next, attachedSet) },
      // The write failed, so the optimistic order is now a lie — put the
      // server's last-known order back rather than leaving a drag result
      // that never persisted.
      { onError: () => setOrderState(prev) },
    );
  };

  // Toggling the SAME row's Preview a second time closes the panel; any
  // other row's Preview swaps its content in — the read-your-own-click
  // behaviour asked for by the task, decided consistently here rather than
  // per click site.
  const togglePreview = (path: string) => setPreviewPath((cur) => (cur === path ? null : path));
  const previewDoc = previewPath ? docs.find((d) => d.path === previewPath) : undefined;
  const previewDetail = previewPath ? detailByPath.get(previewPath) : undefined;
  const previewQuery = previewPath ? queryByPath.get(previewPath) : undefined;

  return (
    <div style={s.outer}>
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
      <p style={s.explanation}>{dragEnabled ? t("context.explanation") : t("context.orderHintFiltered")}</p>
      {activeRepo && <div style={s.repoNote}>{t("context.repoLabel", { name: activeRepo.full_name })}</div>}

      {visible.length === 0 ? (
        <p style={s.hint}>{t("context.noMatches", { query })}</p>
      ) : (
        <div style={s.list} role="list">
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
              <div
                key={doc.path}
                role="listitem"
                aria-label={doc.path}
                draggable={dragEnabled}
                onDragStart={(e) => {
                  if (!dragEnabled) return;
                  setDragPath(doc.path);
                  e.dataTransfer.setData(DRAG_MIME, doc.path);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragPath(null)}
                onDragOver={(e) => {
                  if (dragEnabled) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!dragEnabled) return;
                  e.preventDefault();
                  const dragged = e.dataTransfer.getData(DRAG_MIME) || dragPath;
                  if (dragged) reorder(dragged, doc.path);
                  setDragPath(null);
                }}
                style={s.row(dragPath === doc.path)}
              >
                <button
                  type="button"
                  aria-label={t("context.reorderHandle", { path: doc.path })}
                  disabled={!dragEnabled}
                  style={s.handle(dragEnabled)}
                  // Drag is mouse-only; the arrow keys give the same reorder
                  // to keyboard users (and are what the test drives).
                  onKeyDown={(e) => {
                    if (!dragEnabled) return;
                    const i = order.indexOf(doc.path);
                    if (i < 0) return;
                    const neighbour =
                      e.key === "ArrowUp" ? order[i - 1] : e.key === "ArrowDown" ? order[i + 1] : undefined;
                    if (!neighbour) return;
                    e.preventDefault();
                    reorder(doc.path, neighbour);
                  }}
                >
                  <Icon.Menu size={14} />
                </button>
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
                <button
                  type="button"
                  style={s.preview}
                  aria-pressed={previewPath === doc.path}
                  aria-label={t("context.previewLabel", { path: doc.path })}
                  onClick={() => togglePreview(doc.path)}
                >
                  <Icon.Eye size={12} />
                  {t("context.preview")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
    {previewDoc && (
      <PreviewPanel
        path={previewDoc.path}
        missing={previewDoc.missing}
        tooLarge={previewDoc.too_large}
        detail={previewDetail}
        isLoading={!previewDetail && !previewQuery?.isError}
        isError={!!previewQuery?.isError}
        onClose={() => setPreviewPath(null)}
      />
    )}
    </div>
  );
}
