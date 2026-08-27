/* /repos/:repoId/context — Project Context (specs/09-project-context.md).
   Discovers every .md/.markdown document in the repo's clone, shows it
   read-only, and lets it be attached to agents and skills — the grounding
   an agent's next review actually reads (D1, D2, D4). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles, useReindexContext } from "@/lib/hooks/core";
import { isGenuinelyEmpty, isRepoIndexing } from "./helpers";
import { DocList } from "./_components/DocList";
import { DocViewer } from "./_components/DocViewer";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

const PATH_PARAM = "path";

export function ProjectContextView() {
  const t = useTranslations("context");
  const router = useRouter();
  const routeParams = useParams<{ repoId: string }>();
  const repoId = routeParams.repoId;
  const searchParams = useSearchParams();
  const selectedPath = searchParams?.get(PATH_PARAM) ?? null;

  const { repos } = useActiveRepo();
  const repo = repos.find((r) => r.id === repoId);

  const { data: list, isLoading, isError, refetch } = useContextFiles(repoId);
  const rescan = useReindexContext(repoId);

  const selectPath = React.useCallback(
    (path: string | null) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (path) sp.set(PATH_PARAM, path);
      else sp.delete(PATH_PARAM);
      const qs = sp.toString();
      router.replace(`/repos/${repoId}/context${qs ? `?${qs}` : ""}`);
    },
    [repoId, router, searchParams],
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div style={s.skeletons}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={16} />
        ))}
      </div>
    );
  } else if (isError || !list) {
    body = <ErrorState title={t("rail.loadError")} onRetry={() => refetch()} />;
  } else if (isRepoIndexing(repo)) {
    body = <EmptyState icon="Clock" title={t("states.indexing.title")} body={t("states.indexing.body")} />;
  } else if (isGenuinelyEmpty(repo, list.docs)) {
    body = (
      <EmptyState
        icon="FileText"
        title={t("states.empty.title")}
        body={t("states.empty.body")}
        cta={t("states.empty.cta")}
        onCta={() => rescan.mutate()}
        ctaLoading={rescan.isPending}
      />
    );
  } else {
    body = (
      <div style={s.body}>
        <div style={s.rail}>
          <DocList
            list={list}
            selectedPath={selectedPath}
            onSelect={selectPath}
            onRescan={() => rescan.mutate()}
            rescanning={rescan.isPending}
            rescanError={rescan.isError}
          />
        </div>
        <div style={s.pane}>
          <DocViewer repoId={repoId} docs={list.docs} selectedPath={selectedPath} />
        </div>
      </div>
    );
  }

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {repo?.full_name ?? t("page.repoFallback")}
              </span>
            </h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
        </div>
        {body}
      </div>
    </AppShell>
  );
}
