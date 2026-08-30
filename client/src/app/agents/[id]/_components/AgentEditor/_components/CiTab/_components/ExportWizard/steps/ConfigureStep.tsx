/* Step 3 — Configure. Triggers, `post_as` (two options only — R14), a
   read-only secret status list (R6 — name + boolean, never a value or an
   input), and the CODEOWNERS guidance a security review of phases 1-2 asked
   for (spec `specs/15-export-to-ci.md:99` R6). */
"use client";

import type { Provider, SecretsStatus } from "@devdigest/shared";
import { Badge, Chip, FormField, Icon } from "@devdigest/ui";
import { POST_AS_OPTIONS, SECRET_KEY_BY_PROVIDER, TRIGGER_TYPES } from "../constants";
import { s } from "../styles";
import type { TFunc } from "../types";

export function ConfigureStep({
  t,
  provider,
  manifestPath,
  triggers,
  onToggleTrigger,
  postAs,
  onPostAsChange,
  secretsStatus,
}: {
  t: TFunc;
  provider: Provider;
  manifestPath: string;
  triggers: string[];
  onToggleTrigger: (type: string) => void;
  postAs: (typeof POST_AS_OPTIONS)[number];
  onPostAsChange: (v: (typeof POST_AS_OPTIONS)[number]) => void;
  secretsStatus: SecretsStatus | undefined;
}) {
  const providerKey = SECRET_KEY_BY_PROVIDER[provider];
  const secretRows: Array<{ key: string; configured: boolean | undefined; descKey: string }> = [
    { key: providerKey, configured: secretsStatus?.[provider], descKey: "secretNote" },
    { key: "GITHUB_TOKEN", configured: true, descKey: "githubTokenNote" },
  ];

  return (
    <div style={s.configureWrap}>
      <FormField label={t("triggerLabel")}>
        <div style={s.chipsRow}>
          {TRIGGER_TYPES.map((type) => {
            const on = triggers.includes(type);
            return (
              <Chip key={type} active={on} icon={on ? "Check" : undefined} onClick={() => onToggleTrigger(type)}>
                {`pull_request:${type}`}
              </Chip>
            );
          })}
        </div>
      </FormField>

      <FormField label={t("postResultsLabel")}>
        <div style={s.postAsList}>
          {POST_AS_OPTIONS.map((opt) => {
            const selected = postAs === opt;
            return (
              <label key={opt} style={s.postAsLabel}>
                <input
                  type="radio"
                  name="ci-post-as"
                  checked={selected}
                  onChange={() => onPostAsChange(opt)}
                  style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                />
                <span style={s.radioOuter(selected)}>{selected && <span style={s.radioInner} />}</span>
                {t(`postAs.${opt === "github_review" ? "githubReview" : "none"}`)}
                {opt === "github_review" && (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                    {t("recommended")}
                  </Badge>
                )}
              </label>
            );
          })}
        </div>
      </FormField>

      <FormField label={t("secretsLabel")}>
        <div style={s.secretsBox}>
          {secretRows.map((row, i) => (
            <div key={row.key} style={i === secretRows.length - 1 ? { ...s.secretRow, borderBottom: "none" } : s.secretRow}>
              <span className="mono" style={s.secretKey}>
                {row.key}
              </span>
              <span style={s.secretDesc}>{t(row.descKey, { key: row.key })}</span>
              <Badge
                dot
                color={row.configured ? "var(--ok)" : "var(--warn)"}
                bg={row.configured ? "var(--ok-bg)" : "var(--warn-bg)"}
              >
                {row.configured ? t("secretConfigured") : t("secretNotSet")}
              </Badge>
            </div>
          ))}
        </div>
      </FormField>

      <div style={s.infoBox}>
        <Icon.Info size={15} style={s.infoBoxIcon} />
        <div style={s.infoBoxText}>{t("mergeInfoBody")}</div>
      </div>

      <div style={s.infoBox}>
        <Icon.Shield size={15} style={s.infoBoxIcon} />
        <div style={s.infoBoxText}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>
            {t("codeownersTitle")}
          </div>
          {t("codeownersBody", { path: manifestPath })}
        </div>
      </div>
    </div>
  );
}
