"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { EvalRunGroup } from "@devdigest/shared";
import { Button } from "@devdigest/ui";
import { CompareModal } from "@/components/EvalCompare";
import { pct } from "../helpers";
import { s } from "../styles";

/** Every run of the set, newest first. One row = one `ran_at` group. */
export function RunHistory({ groups }: { groups: EvalRunGroup[] }) {
  const t = useTranslations("agents");
  // Selection is by `ran_at`: the rows of one run share it and there is no run
  // id column, so it IS the run's identity here.
  const [picked, setPicked] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  const toggle = (k: string) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k].slice(-2)));
  const chosen = groups.filter((g) => picked.includes(g.ran_at));
  if (groups.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={s.historyHead}>
        <span style={s.sectionLabel}>{t("evals.history")}</span>
        {groups.length > 1 && (
          <>
            <Button
              kind="secondary"
              size="sm"
              icon="GitBranch"
              disabled={picked.length !== 2}
              onClick={() => setOpen(true)}
            >
              {t("evals.compare")}
            </Button>
            {picked.length !== 2 && <span style={s.rowMeta}>{t("evals.compareHint")}</span>}
          </>
        )}
      </div>
      <div style={s.list}>
        {groups.map((g) => (
          <div key={g.ran_at} style={s.row}>
            <input
              type="checkbox"
              checked={picked.includes(g.ran_at)}
              onChange={() => toggle(g.ran_at)}
              aria-label={t("evals.compare")}
            />
            <div style={s.rowMain}>
              <div style={s.rowName}>{new Date(g.ran_at).toLocaleString()}</div>
              <div style={s.rowMeta}>
                {g.model ?? "—"}
                {g.agent_version !== null ? ` · v${g.agent_version}` : ""}
              </div>
            </div>
            <span style={s.metric}>
              {t("evals.metric.recall")} {pct(g.recall)} · {t("evals.metric.precision")}{" "}
              {pct(g.precision)} · {t("evals.metric.citation")} {pct(g.citation_accuracy)}
            </span>
            <span style={s.metric}>
              {g.passed}/{g.cases_total}
              {/* Without this a run still in flight reads as a finished one
                  with a better score than it will end up having. */}
              {g.complete ? "" : ` · ${t("evals.partial")}`}
            </span>
          </div>
        ))}
      </div>

      {open && chosen.length === 2 && (
        <CompareModal
          // Always older → newer regardless of click order, or the arrows and
          // the sign of every delta flip with the order of selection.
          older={chosen[1]!}
          newer={chosen[0]!}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
