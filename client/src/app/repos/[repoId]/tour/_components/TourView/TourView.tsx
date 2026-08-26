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
import { isNotIndexed } from "./helpers";
import { SKELETON_ROWS } from "./constants";
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
    // Populated tour — built out in Phase B2 (rail, sections, diagram,
    // skeleton banner) and Phase B3 (difficulty basis, stale marker).
    body = null;
  }

  return (
    <AppShell crumb={[{ label: repo?.full_name ?? "", mono: true }, { label: t("title") }]}>
      <div style={s.page}>{body}</div>
    </AppShell>
  );
}
