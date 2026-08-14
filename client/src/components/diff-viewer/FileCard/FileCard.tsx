/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count, findings badge) and, when open, its parsed lines plus any outdated
   comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import {
  diffLineDomId,
  marksForLine,
  worstSeverity,
  type DiffFindingMark,
  type DiffReveal,
} from "../annotations";
import { s, chevronFor, findingBadgeFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  marks = [],
  defaultOpen,
  reveal = null,
  onRevealLine,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Findings in this file, from the PR's latest review. */
  marks?: readonly DiffFindingMark[];
  /** Overrides the size heuristic — Smart Diff collapses boilerplate whatever
   *  its size, and expands a file that has findings however big it is. */
  defaultOpen?: boolean;
  /** Set while this card is the target of a badge click. */
  reveal?: DiffReveal | null;
  /** Clicking the "N findings" badge asks the parent to reveal a line. */
  onRevealLine?: (path: string, line: number) => void;
}) {
  const t = useTranslations("shell");
  const tSmart = useTranslations("prReview.smartDiff");
  const [open, setOpen] = React.useState(
    defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  // Scrolling to a finding is a DOM operation on a node that does not exist
  // until the card is expanded, which is the one thing an effect is for here.
  const target = reveal?.path === file.path ? reveal : null;
  React.useEffect(() => {
    if (!target) return;
    setOpen(true);
    // One frame: React has to commit the expansion before the line has a node.
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(diffLineDomId(file.path, target.line))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [target?.line, target?.nonce, file.path]);

  const badgeSeverity = worstSeverity(marks);

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {badgeSeverity && (
          <button
            type="button"
            style={findingBadgeFor(badgeSeverity)}
            title={marks.map((m) => `L${m.line} · ${m.title}`).join("\n")}
            onClick={(e) => {
              // Without this the header's own toggle would collapse the card we
              // are about to scroll into.
              e.stopPropagation();
              const first = [...marks].sort((a, b) => a.line - b.line)[0];
              if (first) onRevealLine?.(file.path, first.line);
            }}
          >
            {tSmart("findingsBadge", { count: marks.length })}
          </button>
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                marks={marksForLine(ln, marks)}
                revealed={target != null && ln.newNo === target.line}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
