/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, an inline composer, and
   (Smart Diff) the severity chips of findings anchored to this line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { diffLineDomId, worstSeverity, type DiffFindingMark } from "../annotations";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, severityChipFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  marks = [],
  revealed = false,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Findings anchored to this line, if the PR has been reviewed. */
  marks?: readonly DiffFindingMark[];
  /** True for the one line a finding badge was clicked through to. */
  revealed?: boolean;
}) {
  const t = useTranslations("prReview.smartDiff");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const severity = worstSeverity(marks);

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        // The scroll target for a finding badge. Only lines of the new file get
        // one — `newNo` is what a finding's `start_line` refers to.
        id={ln.newNo != null ? diffLineDomId(path, ln.newNo) : undefined}
        style={lineRowFor(ln.kind, { severity, revealed })}
      >
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {severity && (
          <span style={severityChipFor(severity)} title={marks.map((m) => m.title).join(" · ")}>
            {t(`severity.${severity}`)}
            {marks.length > 1 ? ` ×${marks.length}` : ""}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
