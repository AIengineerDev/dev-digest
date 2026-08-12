import type { Provider } from '@devdigest/shared';
import { ConfigError } from '../../platform/errors.js';

/**
 * Turn "OPENROUTER_API_KEY is not configured" into something the reader can act
 * on without opening the source.
 *
 * `container.llm(provider)` cannot write this message itself: it knows the
 * provider and nothing else. Only the caller knows *why* that provider was
 * asked for — an agent's own configuration, or a feature-model setting — and
 * that "why" is the whole difference between a bare environment-variable name
 * and an instruction. Three separate incidents were diagnosed as a missing key
 * when the real fault was a stale provider on a saved object.
 *
 * Wraps only the missing-key case. A network failure, a 401, or an unknown
 * model is a different problem and passes through untouched.
 */
function isMissingKey(err: unknown): err is ConfigError {
  return err instanceof ConfigError && /API_KEY is not configured/.test(err.message);
}

/**
 * The provider came from an **agent**'s configuration — fixable in the agent
 * editor, which is usually the right move when other agents already work.
 */
export async function withAgentProviderContext<T>(
  agent: { name: string; provider: string; model: string },
  resolve: () => Promise<T>,
): Promise<T> {
  try {
    return await resolve();
  } catch (err) {
    if (!isMissingKey(err)) throw err;
    throw new ConfigError(
      `${err.message}. Agent "${agent.name}" is configured for ${agent.provider}/${agent.model} — ` +
        `either point it at a provider you have a key for (Agents → ${agent.name} → Config), ` +
        `or add the key in Settings → API Keys.`,
      { provider: agent.provider, model: agent.model, agent: agent.name },
    );
  }
}

/**
 * The provider came from a **feature-model** setting (or its registry default) —
 * fixable in Settings, and worth naming the feature because the settings screen
 * has one row per feature and the user cannot tell which one asked.
 */
export async function withFeatureProviderContext<T>(
  feature: { id: string; label: string; provider: Provider; model: string },
  resolve: () => Promise<T>,
): Promise<T> {
  try {
    return await resolve();
  } catch (err) {
    if (!isMissingKey(err)) throw err;
    throw new ConfigError(
      `${err.message}. The ${feature.label} model is set to ${feature.provider}/${feature.model} — ` +
        `pick a model from a provider you have a key for (Settings → Feature Models → ${feature.label}), ` +
        `or add the key in Settings → API Keys.`,
      { provider: feature.provider, model: feature.model, feature: feature.id },
    );
  }
}
