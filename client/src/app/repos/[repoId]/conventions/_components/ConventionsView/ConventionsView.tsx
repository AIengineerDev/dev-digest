/* /repos/:repoId/conventions — the Conventions extractor (specs/03-conventions).
   Scan the repo, review each candidate against the code it was derived from, and
   promote the accepted ones into one skill. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionCategory, ConventionStatus } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "./_components/ConventionCard";
import { SkillFromConventionsModal } from "./_components/SkillFromConventionsModal";
import { countByStatus, sortForReview } from "./helpers";
import { s } from "./styles";

const SKELETON_CARDS = 3;

export function ConventionsView() {
  const t = useTranslations("conventions");
  const router = useRouter();
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { repos } = useActiveRepo();
  const repo = repos.find((r) => r.id === repoId);

  const { data: conventions, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [creatingSkill, setCreatingSkill] = React.useState(false);

  const list = sortForReview(conventions ?? []);
  const counts = countByStatus(list);
  const accepted = list.filter((c) => c.status === "accepted");
  const scanned = extract.data;

  const decide = (id: string, status: ConventionStatus) =>
    update.mutate({ id, patch: { status } });

  const edit = (id: string, patch: { rule: string; category: ConventionCategory }) =>
    update.mutate({ id, patch });

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      {creatingSkill && (
        <SkillFromConventionsModal
          repoId={repoId}
          repoFullName={repo?.full_name}
          accepted={accepted}
          onClose={() => setCreatingSkill(false)}
          onCreated={(skillId) => {
            setCreatingSkill(false);
            router.push(`/skills?selected=${skillId}`);
          }}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {repo?.full_name ?? t("page.repoFallback")}
              </span>
            </h1>
            <p style={s.subtitle}>
              {scanned
                ? t("page.scanSummary", {
                    files: scanned.sampled_files.length,
                    proposed: scanned.proposed,
                    dropped: scanned.dropped,
                  })
                : t("page.subtitle")}
            </p>
          </div>
          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={extract.isPending}
              disabled={extract.isPending}
              onClick={() => extract.mutate()}
            >
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          </div>
        </div>

        {extract.isError && (
          <div role="alert" style={s.error}>
            {t("page.extractionFailed")}
          </div>
        )}

        {list.length > 0 && (
          <div style={s.toolbar}>
            <div style={s.counts}>
              <Badge mono>{t("page.pendingCount", { count: counts.pending })}</Badge>
              <Badge mono color="var(--ok)" bg="var(--ok-bg)">
                {t("page.acceptedCount", { count: counts.accepted })}
              </Badge>
              <Badge mono>{t("page.rejectedCount", { count: counts.rejected })}</Badge>
            </div>
            <div style={s.spacer} />
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              disabled={accepted.length === 0}
              onClick={() => setCreatingSkill(true)}
            >
              {t("page.createSkill", { count: accepted.length })}
            </Button>
          </div>
        )}

        {isLoading && (
          <div style={s.skeletons}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={180} />
            ))}
          </div>
        )}

        {isError && (
          <ErrorState title={t("page.loadError")} onRetry={() => void refetch()} />
        )}

        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
            onCta={() => extract.mutate()}
          />
        )}

        {!isLoading &&
          !isError &&
          list.map((c) => (
            <ConventionCard
              key={c.id}
              convention={c}
              repoFullName={repo?.full_name}
              defaultBranch={repo?.default_branch}
              busy={update.isPending}
              onDecide={decide}
              onEdit={edit}
            />
          ))}
      </div>
    </AppShell>
  );
}
