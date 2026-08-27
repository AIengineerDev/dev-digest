/* PreviewPanel — the right-hand pane opened by a row's Preview action.
   Renders the SAME document detail ContextTab already fetches (one
   `useQueries` entry per row, keyed exactly like `useProjectContextDoc` in
   `lib/hooks/core.ts`), so opening a preview costs no new request and no new
   hook: the caller passes the row's own `detail`/`isLoading`/`isError`
   through.

   Deliberately NOT a lift of the Project Context page's own
   `ProjectContextView/_components/DocViewer` — that component is coupled to
   its route (github link, "used by N agents", Skills/Agents tabs) and is
   route-private `_components`. This mirrors only the one piece this panel
   needs: `Markdown` from `@devdigest/ui` rendering `detail.content`
   (`frontend-ui-architecture` skill, one-consumer placement). */
"use client";

import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import type { ProjectContextDocDetail } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewPanel({
  path,
  missing,
  tooLarge,
  detail,
  isLoading,
  isError,
  onClose,
}: {
  path: string;
  missing: boolean;
  tooLarge: boolean;
  detail: ProjectContextDocDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("agents");

  return (
    <div style={s.wrap} role="region" aria-label={path}>
      <div style={s.header}>
        <span className="mono" style={s.path}>
          {path}
        </span>
        <button type="button" style={s.close} aria-label={t("context.previewPanel.closeLabel", { path })} onClick={onClose}>
          <Icon.X size={16} />
        </button>
      </div>
      <div style={s.body}>
        {missing ? (
          <EmptyState
            icon="FileText"
            title={t("context.previewPanel.missingTitle")}
            body={t("context.previewPanel.missingBody", { path })}
          />
        ) : tooLarge ? (
          <EmptyState
            icon="FileText"
            title={t("context.previewPanel.tooLargeTitle")}
            body={t("context.previewPanel.tooLargeBody", { path })}
          />
        ) : isLoading ? (
          <div aria-busy="true" aria-label={t("context.previewPanel.loading")}>
            <Skeleton style={s.skeletonLine} />
            <Skeleton style={s.skeletonLine} />
            <Skeleton style={s.skeletonLineShort} />
          </div>
        ) : isError || !detail ? (
          <ErrorState title={t("context.previewPanel.loadErrorTitle")} body={t("context.previewPanel.loadErrorBody")} />
        ) : (
          <Markdown>{detail.content}</Markdown>
        )}
      </div>
    </div>
  );
}
