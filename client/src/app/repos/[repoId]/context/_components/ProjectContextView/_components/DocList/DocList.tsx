/* DocList — the left rail: search, grouped-by-directory rows, and the footer
   (specs/09-project-context.md R1, R3a, D4, C3, C4, C5, C6). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { ProjectContextList } from "@devdigest/shared";
import { filterDocs, groupByDirectory } from "../../helpers";
import { s } from "./styles";

export function DocList({
  list,
  selectedPath,
  onSelect,
  onRescan,
  rescanning,
  rescanError,
}: {
  list: ProjectContextList;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRescan: () => void;
  rescanning: boolean;
  rescanError: boolean;
}) {
  const t = useTranslations("context");
  const [query, setQuery] = React.useState("");
  const filtered = filterDocs(list.docs, query);
  const groups = groupByDirectory(filtered);

  return (
    <div>
      <div style={s.toolbar}>
        <input
          style={s.search}
          placeholder={t("rail.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("rail.searchPlaceholder")}
        />
        <Button kind="secondary" size="sm" icon="RefreshCw" onClick={onRescan} disabled={rescanning}>
          {rescanning ? t("rail.rescanning") : t("rail.rescan")}
        </Button>
      </div>

      {rescanError && <div style={s.truncated}>{t("rail.rescanError")}</div>}
      {list.truncated && <div style={s.truncated}>{t("rail.truncated", { limit: list.limit })}</div>}

      <div style={s.scroll}>
        {groups.map((g) => (
          <div key={g.dir || "."}>
            <div style={s.groupHeader}>{g.dir || "/"}</div>
            {g.docs.map((doc) => {
              const dim = doc.missing || doc.too_large;
              return (
                <button
                  key={doc.path}
                  style={s.row(doc.path === selectedPath)}
                  onClick={() => onSelect(doc.path)}
                  aria-current={doc.path === selectedPath ? "true" : undefined}
                >
                  <span style={s.rowPath(dim)} className="mono">
                    {doc.path}
                  </span>
                  {doc.missing && (
                    <Badge color="var(--crit)" bg="var(--crit-bg)">
                      {t("rail.missingBadge")}
                    </Badge>
                  )}
                  {!doc.missing && doc.too_large && (
                    <Badge color="var(--warn)" bg="var(--warn-bg)">
                      {t("rail.tooLargeBadge")}
                    </Badge>
                  )}
                  <span style={s.rowTokens} className="tnum">
                    {doc.tokens == null ? t("rail.tokensPending") : t("doc.tokens", { tokens: doc.tokens })}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div style={s.footer}>
        <span>{t("rail.footer", { files: list.docs.length, tokens: list.total_tokens })}</span>
        {list.head_sha && (
          <span className="mono">
            <Icon.GitCommit size={11} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            {t("rail.readAt", { sha: list.head_sha.slice(0, 7) })}
          </span>
        )}
      </div>
    </div>
  );
}
