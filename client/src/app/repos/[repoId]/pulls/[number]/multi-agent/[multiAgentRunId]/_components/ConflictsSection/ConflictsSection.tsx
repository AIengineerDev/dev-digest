/* ConflictsSection — "Where agents disagree" (R4).
   design-mocks/src/19-screen_multiagent.jsx:21-40. Renders `groups` straight
   off the parent's query result and computes nothing: `conflict` is a server
   field (C3), the filter is a local boolean over an array the query already
   holds. No second fetch, no client-side grouping. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel, SEV, Toggle } from "@devdigest/ui";
import type { FindingGroup } from "@devdigest/shared";
import { s } from "./styles";

export function ConflictsSection({ groups }: { groups: FindingGroup[] }) {
  const t = useTranslations("runs");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const visible = onlyConflicts ? groups.filter((g) => g.conflict) : groups;

  return (
    <div style={s.wrapper}>
      <SectionLabel
        icon="Activity"
        right={
          <label style={s.toggleLabel}>
            {t("conflicts.onlyConflicts")}
            <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={15} />
          </label>
        }
      >
        {t("conflicts.title")}
      </SectionLabel>

      {visible.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{t("conflicts.empty")}</p>
      ) : (
        <div style={s.list}>
          {visible.map((g) => (
            <div key={g.key} style={s.group}>
              <div style={s.groupHeader}>
                <Icon.Code size={13} style={{ color: "var(--text-muted)" }} />
                <span className="mono" style={{ fontSize: 12 }}>
                  {g.file}:{g.anchor_start}
                </span>
                <span style={s.groupTitle}>{g.title}</span>
              </div>
              <div style={s.takesGrid(g.takes.length)}>
                {g.takes.map((take) => {
                  const flagged = take.finding !== null;
                  const color = flagged ? SEV[take.finding!.severity].c : "var(--text-muted)";
                  return (
                    <div key={take.agent_id} style={s.cell}>
                      <div style={s.cellAgent}>{take.agent_name ?? take.agent_id}</div>
                      <div style={s.cellVerdictRow}>
                        <span style={s.dot(color)} />
                        <span style={s.verdict(flagged)}>
                          {flagged ? take.finding!.severity : t("conflicts.didNotFlag")}
                        </span>
                      </div>
                      {flagged && (
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4 }}>
                          {take.finding!.rationale}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
