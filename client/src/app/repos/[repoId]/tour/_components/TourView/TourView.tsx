/* /repos/:repoId/tour — Onboarding Tour (specs/12-onboarding-generator.md).
   A deterministic, code-derived skeleton optionally annotated by one
   structured model call. States: loading, load error (checked BEFORE the
   empty branch — client/INSIGHTS.md's RunReviewDropdown defect), not-indexed
   (a disabled Generate), not-yet-generated (a CTA), and populated (five
   sections, built out in Phase B2/B3). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton, Button } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useTour, useGenerateTour, useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { CriticalPathsSection } from "./_components/CriticalPathsSection";
import { HowToRunSection } from "./_components/HowToRunSection";
import { GuidedReadingSection } from "./_components/GuidedReadingSection";
import { FirstTasksSection } from "./_components/FirstTasksSection";
import { isNotIndexed, isRailDim, sectionFor } from "./helpers";
import { SECTION_ORDER, SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function TourView() {
  const t = useTranslations("onboarding");
  const routeParams = useParams<{ repoId: string }>();
  const repoId = routeParams.repoId;

  const { repos } = useActiveRepo();
  const repo = repos.find((r) => r.id === repoId);

  const { data: tour, isLoading, isError, error, refetch } = useTour(repoId);
  const generate = useGenerateTour(repoId);
  const indexStatus = useRepoIntelStatus(repoId);
  const resync = useResyncRepoIntel(repoId);

  let body: React.ReactNode;

  if (isLoading || indexStatus.isLoading) {
    body = (
      <div style={s.skeletons}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={16} />
        ))}
      </div>
    );
  } else if (isError) {
    // Checked BEFORE the not-generated/not-indexed branches — a failed query
    // must not fall through into either, the RunReviewDropdown defect
    // (client/INSIGHTS.md, 2026-08-09).
    body = (
      <ErrorState
        title={t("loadError.title")}
        body={error instanceof ApiError ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  } else if (isNotIndexed(indexStatus.data)) {
    // EmptyState renders exactly one CTA; this state needs two (Resync +
    // a disabled Generate), so it is built directly rather than squeezed
    // into that primitive.
    body = (
      <div style={s.notIndexed}>
        <p style={s.notIndexedTitle}>{t("notIndexed.title")}</p>
        <p style={s.bannerText}>{t("notIndexed.body")}</p>
        <div style={s.notIndexedActions}>
          <Button kind="secondary" icon="RefreshCw" loading={resync.isPending} onClick={() => resync.mutate()}>
            {t("notIndexed.resync")}
          </Button>
          <Button kind="primary" icon="Boxes" disabled>
            {t("notIndexed.generate")}
          </Button>
        </div>
      </div>
    );
  } else if (!tour) {
    body = (
      <>
        <EmptyState
          icon="Boxes"
          title={t("generate.title")}
          body={
            <>
              {t("generate.body")} {t("generate.estimate")}
            </>
          }
          cta={t("generate.cta")}
          onCta={() => generate.mutate(false)}
          ctaLoading={generate.isPending}
        />
        {generate.isError && (
          <p style={s.bannerText}>
            {generate.error instanceof Error ? generate.error.message : t("unknownError")}
          </p>
        )}
      </>
    );
  } else {
    const filesIndexed = indexStatus.data?.filesIndexed;
    const partialIndex = tour.index_status === "partial" || tour.index_status === "degraded";
    const hasSkeleton = tour.skeleton_sections.length > 0;

    body = (
      <>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("title")}{" "}
              <span className="mono" style={s.repoName}>
                {repo?.full_name ?? ""}
              </span>
            </h1>
            <p style={s.subtitle}>
              {filesIndexed != null ? t("header.subtitle", { count: filesIndexed }) : t("header.subtitleUnknown")}
            </p>
          </div>
          <div style={s.headerActions}>
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              loading={generate.isPending}
              onClick={() => generate.mutate(true)}
            >
              {generate.isPending ? t("regenerating") : t("regenerate")}
            </Button>
          </div>
        </div>

        {partialIndex && (
          <div style={s.banner}>
            <p style={s.bannerText}>
              {t("partialIndex.banner", { status: tour.index_status ?? "", count: tour.files_skipped ?? 0 })}
            </p>
          </div>
        )}

        {hasSkeleton && (
          <div role="status" style={s.banner}>
            <p style={s.bannerText}>{t("skeleton.banner", { error: tour.error ?? t("unknownError") })}</p>
          </div>
        )}

        <div style={s.body}>
          <nav style={s.rail} aria-label={t("rail.onThisPage")}>
            <div style={s.railLabel}>{t("rail.onThisPage")}</div>
            {SECTION_ORDER.map((kind) => {
              const section = sectionFor(tour, kind);
              return (
                <a key={kind} href={`#${kind}`} style={s.railLink(isRailDim(section))}>
                  {section.title}
                </a>
              );
            })}
          </nav>
          <div style={s.content}>
            <ArchitectureSection section={sectionFor(tour, "architecture_overview")} />
            <CriticalPathsSection section={sectionFor(tour, "critical_paths")} />
            <HowToRunSection section={sectionFor(tour, "how_to_run")} />
            <GuidedReadingSection section={sectionFor(tour, "guided_reading")} />
            <FirstTasksSection section={sectionFor(tour, "first_tasks")} />
          </div>
        </div>
      </>
    );
  }

  return (
    <AppShell crumb={[{ label: repo?.full_name ?? "", mono: true }, { label: t("title") }]}>
      <div style={s.page}>{body}</div>
    </AppShell>
  );
}
