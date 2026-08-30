/* /memory — what DevDigest has learned about this workspace's code.

   The `memory` table is the RAG store: decisions, conventions, preferences,
   facts and learnings, each embedded for semantic recall into review prompts.

   NOTHING WRITES IT YET. The extraction that would fill it — watch a review,
   decide what is worth keeping, embed it — is not built, so this screen is its
   empty state in every deployment today. That is deliberate and stated on the
   screen itself: a reader who finds an empty table deserves to know whether
   they have no memories or no feature. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton, Badge } from "@devdigest/ui";
import type { MemoryEntry } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { useMemory } from "../../../../lib/hooks/ci";
import { s } from "./styles";

const KIND_COLOR: Record<string, string> = {
  decision: "var(--accent)",
  convention: "var(--ok)",
  preference: "var(--text-secondary)",
  fact: "var(--text-secondary)",
  learning: "var(--warn)",
};

function when(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

export function MemoryView() {
  const t = useTranslations("memory");
  const { data, isLoading, isError, refetch } = useMemory();

  const header = (
    <div style={s.head}>
      <h1 style={s.title}>{t("title")}</h1>
      <p style={s.subtitle}>{t("subtitle")}</p>
    </div>
  );

  if (isLoading) {
    return (
      <AppShell>
        {header}
        <div style={s.table}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ padding: "14px 16px" }}>
              <Skeleton height={16} />
            </div>
          ))}
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell>
        {header}
        <div style={{ padding: "24px 28px" }}>
          <ErrorState title={t("loadError")} body={t("loadErrorBody")} onRetry={() => refetch()} />
        </div>
      </AppShell>
    );
  }

  const entries: MemoryEntry[] = data ?? [];

  if (entries.length === 0) {
    return (
      <AppShell>
        {header}
        <div style={{ padding: "24px 28px" }}>
          <EmptyState icon="Database" title={t("empty")} body={t("emptyBody")} />
        </div>
      </AppShell>
    );
  }

  const cols = [t("col.scope"), t("col.kind"), t("col.content"), t("col.confidence"), t("col.lastUsed")];

  return (
    <AppShell>
      {header}
      <div style={s.table}>
        <div style={{ display: "grid", gridTemplateColumns: s.grid, ...s.headRow }}>
          {cols.map((c) => (
            <div key={c}>{c}</div>
          ))}
        </div>
        {entries.map((m, i) => (
          <div
            key={m.id}
            style={{
              display: "grid",
              gridTemplateColumns: s.grid,
              ...s.row,
              borderBottom: i < entries.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            <span style={s.num}>{m.repo ?? m.scope}</span>
            <Badge color={KIND_COLOR[m.kind] ?? "var(--text-secondary)"}>{m.kind}</Badge>
            <span style={s.content}>{m.content}</span>
            <span className="tnum" style={s.num}>
              {m.confidence === null ? "—" : `${Math.round(m.confidence * 100)}%`}
            </span>
            <span style={s.num}>{when(m.last_used_at) ?? t("neverUsed")}</span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
