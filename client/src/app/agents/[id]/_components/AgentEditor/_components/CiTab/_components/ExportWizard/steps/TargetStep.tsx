/* Step 1 — Target. GitHub Actions is the only selectable card (R2); the other
   three render `coming soon`, `aria-disabled`, focusable but unselectable. */
"use client";

import { Badge, FormField, Icon, TextInput } from "@devdigest/ui";
import { CI_TARGET_CARDS } from "../constants";
import { s } from "../styles";
import type { TFunc } from "../types";

export function TargetStep({
  t,
  repo,
  onRepoChange,
}: {
  t: TFunc;
  repo: string;
  onRepoChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={s.targetGrid}>
        {CI_TARGET_CARDS.map((card) => {
          const selected = card.key === "gha";
          const I = Icon[card.icon];
          return (
            <button
              key={card.key}
              type="button"
              aria-disabled={card.disabled}
              aria-pressed={selected}
              onClick={card.disabled ? undefined : () => {}}
              style={s.targetCard(selected, card.disabled)}
            >
              <div style={s.targetCardHead}>
                <div style={s.targetIconTile(selected)}>
                  <I size={18} />
                </div>
                <span style={s.targetName}>{t(card.nameKey)}</span>
                {selected ? (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)" style={{ marginLeft: "auto" }}>
                    {t("recommended")}
                  </Badge>
                ) : (
                  <Badge color="var(--text-muted)" style={{ marginLeft: "auto" }}>
                    {t("targets.comingSoon")}
                  </Badge>
                )}
              </div>
              <p style={s.targetDesc}>{t(card.descKey)}</p>
            </button>
          );
        })}
      </div>
      <div style={s.repoField}>
        <FormField label={t("repoLabel")} hint={t("repoHint")}>
          <TextInput mono value={repo} onChange={onRepoChange} placeholder={t("repoPlaceholder")} />
        </FormField>
      </div>
    </div>
  );
}
