/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline.
   Optional finding annotations (Smart Diff): severity marks, a clickable
   "N findings" badge per file, and scroll-to-line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { type DiffAnnotations, type DiffReveal } from "../annotations";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  annotations,
  defaultOpenFor,
  reveal = null,
  onRevealLine,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Findings per path, from the PR's latest review. Absent = never reviewed,
   *  and the viewer renders exactly as it did before Smart Diff existed. */
  annotations?: DiffAnnotations;
  /** Overrides each card's size heuristic per file (Smart Diff collapses
   *  boilerplate whatever its size, and expands anything with a finding). */
  defaultOpenFor?: (file: PrFile) => boolean;
  reveal?: DiffReveal | null;
  onRevealLine?: (path: string, line: number) => void;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard
          key={i}
          file={f}
          commenting={commenting}
          marks={annotations?.get(f.path) ?? []}
          defaultOpen={defaultOpenFor?.(f)}
          reveal={reveal}
          onRevealLine={onRevealLine}
        />
      ))}
    </div>
  );
}
