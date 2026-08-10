import type { ModelInfo, Provider } from "@devdigest/shared";
import { toModelOptions } from "../../../../../../../lib/model-label";

/** Pure helpers for SettingsModels. */

/** Sentinel option value that clears a feature's override. */
export const USE_DEFAULT = "__default__";

/** The providers a feature model may be served by, in picker order. */
export const SELECTABLE_PROVIDERS: Provider[] = ["openai", "anthropic", "openrouter"];

export interface ModelOption {
  value: string;
  label: string;
}

/**
 * Encode a choice as one option value.
 *
 * The provider travels WITH the model instead of being inferred afterwards.
 * That is the whole point: this picker previously listed OpenRouter's catalogue
 * for every feature and then saved some other provider beside it, which
 * produced pairs no backend could serve — a first-party key asked for
 * `deepseek/…`, or an OpenRouter key demanded on a workspace that has none.
 * A model id alone cannot tell you who serves it (`openai/gpt-5.6` is a valid
 * OpenRouter id *and* looks first-party), so it is carried, never guessed.
 */
export function encodeChoice(provider: Provider, model: string): string {
  return `${provider}:${model}`;
}

/** Inverse of `encodeChoice`. Splits on the FIRST colon — model ids may contain more. */
export function decodeChoice(value: string): { provider: Provider; model: string } | null {
  const at = value.indexOf(":");
  if (at <= 0) return null;
  const provider = value.slice(0, at) as Provider;
  const model = value.slice(at + 1);
  if (!SELECTABLE_PROVIDERS.includes(provider) || model.length === 0) return null;
  return { provider, model };
}

/**
 * One flat option list across every provider the workspace actually has a key
 * for, each entry labelled with its provider so two vendors offering the same
 * model id stay distinguishable.
 */
export function buildModelOptions(
  byProvider: { provider: Provider; models: ModelInfo[] | undefined }[],
): ModelOption[] {
  const options: ModelOption[] = [];
  for (const { provider, models } of byProvider) {
    if (!models || models.length === 0) continue;
    for (const opt of toModelOptions(models)) {
      const model = typeof opt === "string" ? opt : opt.value;
      const label = typeof opt === "string" ? opt : opt.label;
      options.push({ value: encodeChoice(provider, model), label: `${provider} · ${label}` });
    }
  }
  return options;
}

/**
 * Make the stored choice selectable even when it is not in any live list — an
 * override pointing at a retired model, or a provider whose key was removed.
 * Without this the select would silently show the first option and a save would
 * overwrite a choice the user never revisited.
 */
export function withCurrentChoice(
  options: ModelOption[],
  current: { provider: Provider; model: string },
): ModelOption[] {
  const value = encodeChoice(current.provider, current.model);
  if (options.some((o) => o.value === value)) return options;
  return [{ value, label: `${current.provider} · ${current.model}` }, ...options];
}
