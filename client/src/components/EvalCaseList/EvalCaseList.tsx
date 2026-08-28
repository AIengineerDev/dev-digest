"use client";

import { useTranslations } from "next-intl";
import type { EvalCase, EvalRunGroup } from "@devdigest/shared";
import * as React from "react";
import { Badge, Icon, IconBtn } from "@devdigest/ui";
import { useDeleteEvalCase, useRunEvalCase } from "@/lib/hooks";
import { expectedLabel, resultLabel, statusOf } from "./helpers";
import { s } from "./styles";

/**
 * One agent's eval cases, with the per-case actions.
 *
 * Lives here rather than beside the agent editor because the SKILL editor shows
 * the same rows: a skill is judged by the sets of the agents that link it, and
 * "the same list, minus the buttons" would be a worse answer than sharing one.
 *
 * The actions are case-scoped on the server (`/eval-cases/:id/...`), so they
 * work identically from either place — `agentId` is only needed to know which
 * queries to invalidate.
 *
 * Design: design-mocks/src/06-components2.jsx:43 (`EvalCaseRow`) — status glyph,
 * mono name, the "expected N, got M" line, the expectation badge, and the
 * Play / Edit / Trash actions revealed on hover.
 */
export function EvalCaseList({
  cases,
  latest,
  agentId,
  onEdit,
}: {
  cases: EvalCase[];
  latest: EvalRunGroup | null;
  agentId: string;
  onEdit: (c: EvalCase) => void;
}) {
  const t = useTranslations("agents");
  const runOne = useRunEvalCase();
  const del = useDeleteEvalCase();
  // Which row the pointer is on: the mock reveals the actions on hover so a
  // list of ten cases is not a wall of thirty buttons.
  const [hover, setHover] = React.useState<string | null>(null);
  const byCase = new Map((latest?.runs ?? []).map((r) => [r.case_id, r]));

  const GLYPH = {
    pass: { Comp: Icon.CheckCircle, color: "var(--ok)" },
    fail: { Comp: Icon.XCircle, color: "var(--crit)" },
    never: { Comp: Icon.Dot, color: "var(--text-muted)" },
  } as const;

  return (
    <div style={s.list}>
      {cases.map((c) => {
        const run = byCase.get(c.id) ?? null;
        // Three states, not two: a case with no run is not a failing case, and
        // the mock gives it its own muted glyph rather than a red one.
        const { Comp, color } = GLYPH[statusOf(run)];
        return (
          <div
            key={c.id}
            style={s.row}
            onMouseEnter={() => setHover(c.id)}
            onMouseLeave={() => setHover((h) => (h === c.id ? null : h))}
          >
            <Comp size={15} style={{ color, flexShrink: 0 }} />
            <div style={s.rowMain}>
              <div className="mono" style={s.rowName}>
                {c.name}
              </div>
              <div style={s.rowMeta}>{resultLabel(c, run, t)}</div>
            </div>
            <Badge color="var(--text-muted)">{expectedLabel(c, t)}</Badge>
            {/* Design: design-mocks/src/06-components2.jsx:54 — Play / Edit /
                Trash, dimmed until the row is hovered. */}
            <div style={s.rowActions(hover === c.id)}>
              <IconBtn
                icon="Play"
                label={t("evals.runOne")}
                size={26}
                // IconBtn takes no `disabled`; guarding the handler is what
                // stops a second click queueing a second model call.
                onClick={() => {
                  if (!runOne.isPending) runOne.mutate({ caseId: c.id, agentId });
                }}
              />
              <IconBtn icon="Edit" label={t("evals.edit")} size={26} onClick={() => onEdit(c)} />
              <IconBtn
                icon="Trash"
                label={t("evals.delete")}
                size={26}
                danger
                // Deleting takes the case's runs with it, so it asks first.
                onClick={() => {
                  if (del.isPending) return;
                  if (window.confirm(t("evals.deleteConfirm", { name: c.name }))) {
                    del.mutate({ caseId: c.id, agentId });
                  }
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
