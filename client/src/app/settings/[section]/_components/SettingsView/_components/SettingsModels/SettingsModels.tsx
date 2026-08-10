"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SearchableSelect, Icon } from "@devdigest/ui";
import { useSettings, useUpdateSettings, useSecretsStatus } from "../../../../../../../lib/hooks";
import { useProviderModels } from "../../../../../../../lib/hooks/agents";
import {
  USE_DEFAULT,
  buildModelOptions,
  decodeChoice,
  encodeChoice,
  withCurrentChoice,
} from "./helpers";
import { FEATURE_MODELS } from "../../../../../../../lib/feature-models";
import type { FeatureModelChoice, FeatureModelId } from "../../../../../../../lib/types";
import { SectionTitle } from "../SectionTitle";
import { s } from "./styles";

/**
 * Settings → Feature Models. One picker per system LLM feature; the choice
 * persists to `settings.feature_models`, and a feature falls back to its
 * registry default when unset.
 *
 * The list is built from EVERY provider the workspace has a key for, and each
 * option carries its provider so the saved `{provider, model}` pair is exactly
 * what was picked. An earlier version listed only OpenRouter and paired it with
 * the feature's registry provider, which produced combinations no backend could
 * serve — see helpers.ts.
 */
export function SettingsModels() {
  const t = useTranslations("settings");
  const { data: settings } = useSettings();
  const { data: secrets } = useSecretsStatus();
  const update = useUpdateSettings();

  // One hook per provider — a fixed count, each enabled only when that key
  // exists, so a workspace with direct keys never calls OpenRouter and vice
  // versa. Conditional hook counts would break the rules of hooks.
  const openai = useProviderModels(secrets?.openai ? "openai" : null);
  const anthropic = useProviderModels(secrets?.anthropic ? "anthropic" : null);
  const openrouter = useProviderModels(secrets?.openrouter ? "openrouter" : null);

  const chosen = (settings?.feature_models ?? {}) as Partial<
    Record<FeatureModelId, FeatureModelChoice>
  >;

  const baseOptions = React.useMemo(
    () =>
      buildModelOptions([
        { provider: "openai", models: openai.data },
        { provider: "anthropic", models: anthropic.data },
        { provider: "openrouter", models: openrouter.data },
      ]),
    [openai.data, anthropic.data, openrouter.data],
  );

  const anyKey = !!secrets && (secrets.openai || secrets.anthropic || secrets.openrouter);
  const noModels = anyKey && baseOptions.length === 0;

  const setChoice = (id: FeatureModelId, value: string) => {
    if (value === USE_DEFAULT) {
      // Clearing means removing the key, not writing the default back in — a
      // stored copy of a default stops tracking it the moment the default moves.
      const { [id]: _dropped, ...rest } = chosen;
      update.mutate({ feature_models: rest });
      return;
    }
    const decoded = decodeChoice(value);
    if (!decoded) return;
    update.mutate({
      feature_models: { ...chosen, [id]: { provider: decoded.provider, model: decoded.model } },
    });
  };

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("models.title")} body={t("models.body")} />

      {FEATURE_MODELS.map((f) => {
        const override = chosen[f.id];
        const isDefault = !override;
        const current = override ?? { provider: f.defaultProvider, model: f.defaultModel };
        const options = [
          {
            value: USE_DEFAULT,
            label: t("models.useDefault", {
              provider: f.defaultProvider,
              model: f.defaultModel,
            }),
          },
          ...withCurrentChoice(baseOptions, current),
        ];
        return (
          <div key={f.id} style={s.row}>
            <FormField
              label={
                <>
                  {f.label}
                  {isDefault && <span style={s.defaultTag}>{t("models.usingDefault")}</span>}
                </>
              }
              hint={f.description}
            >
              <SearchableSelect
                value={isDefault ? USE_DEFAULT : encodeChoice(current.provider, current.model)}
                onChange={(v) => setChoice(f.id, v)}
                options={options}
                placeholder={t("models.search")}
              />
            </FormField>
          </div>
        );
      })}

      <div style={s.note}>
        <Icon.Info size={15} style={s.noteIcon} />
        <span>
          {!anyKey
            ? t("models.noKeyNote")
            : noModels
              ? t("models.noModelsNote")
              : t("models.liveNote")}
        </span>
      </div>
    </div>
  );
}
