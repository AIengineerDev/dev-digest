/* Compare two runs — metric deltas and the system-prompt diff between them
   (spec 13, R9). Design: the course "Compare runs · v6 → v7" screen.

   Both runs come from their stored rows: no re-run, and the prompt shown is the
   snapshot each run actually used — not the agent's current prompt. The agent
   may have been edited again since, and a diff against "now" would explain the
   wrong thing. */
"use client";

import { useTranslations } from "next-intl";
import type { EvalRunGroup } from "@devdigest/shared";
import { Modal } from "@devdigest/ui";
import { diffLines } from "./helpers";
import { s } from "./styles";

function Delta({
  label,
  from,
  to,
  pct = true,
}: {
  label: string;
  from: number | null;
  to: number | null;
  pct?: boolean;
}) {
  const fmt = (v: number | null) =>
    v === null ? "—" : pct ? `${Math.round(v * 100)}%` : `$${v.toFixed(2)}`;
  const d = from === null || to === null ? null : to - from;
  const pts = d === null ? null : pct ? Math.round(d * 100) : Number(d.toFixed(2));
  return (
    <div style={s.deltaCard}>
      <span style={s.tileLabel}>{label}</span>
      <div style={s.deltaRow}>
        <span style={s.deltaFrom}>{fmt(from)}</span>
        <span style={s.deltaArrow}>→</span>
        <span style={s.deltaTo}>{fmt(to)}</span>
      </div>
      {/* Unknown and unchanged are different claims. */}
      <span style={s.deltaPts(pts === null ? null : pts >= 0)}>
        {pts === null ? "—" : `${pts >= 0 ? "▲" : "▼"} ${Math.abs(pts)}${pct ? "pt" : ""}`}
      </span>
    </div>
  );
}

export function CompareModal({
  older,
  newer,
  onClose,
}: {
  older: EvalRunGroup;
  newer: EvalRunGroup;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const lines = diffLines(older.system_prompt, newer.system_prompt);

  return (
    <Modal width={860} title={t("compare.title")} subtitle={t("compare.subtitle")} onClose={onClose}>
      <div style={s.compareBody}>
        <div style={s.deltaGrid}>
          <Delta label={t("agent.metric.recall")} from={older.recall} to={newer.recall} />
          <Delta label={t("agent.metric.precision")} from={older.precision} to={newer.precision} />
          <Delta
            label={t("agent.metric.citation")}
            from={older.citation_accuracy}
            to={newer.citation_accuracy}
          />
          <Delta label={t("compare.cost")} from={older.cost_usd} to={newer.cost_usd} pct={false} />
        </div>

        <div>
          <div style={s.promptHead}>{t("compare.promptDiff")}</div>
          {lines === null ? (
            <div style={s.promptNote}>{t("compare.noPrompt")}</div>
          ) : lines.length === 0 ? (
            // Metrics moving with an identical prompt is a real result, and the
            // one most easily misread as "the edit worked".
            <div style={s.promptNote}>{t("compare.samePrompt")}</div>
          ) : (
            <pre style={s.promptDiff}>
              {lines.map((l, i) => (
                <div key={i} style={s.diffLine(l.kind)}>
                  {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
                  {l.text}
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </Modal>
  );
}
