/**
 * cost discipline — per-provider/model pricing table (USD per 1M tokens).
 * Unknown models return null cost (explicitly flagged), per spec.
 */
interface Price {
  in: number;
  out: number;
}

const PRICING: Record<string, Price> = {
  // OpenAI (approximate public list prices, USD / 1M tokens)
  //
  // gpt-5.6-* are the models the built-in reviewer agents run on (Settings →
  // Agents). Figures verified 2026-08-06 against OpenRouter's public /models
  // endpoint (`curl -s https://openrouter.ai/api/v1/models`), which is also what
  // PriceBook reads at runtime — see the note in price-book.ts about why the
  // live path does not currently cover these.
  //
  // The three tiers are an order of magnitude apart, so do NOT copy one row to
  // another when adding a sibling model: an earlier placeholder that reused the
  // sol price for luna overstated it 50×.
  'gpt-5.6-sol': { in: 5.0, out: 30.0 },
  'gpt-5.6-terra': { in: 1.0, out: 6.0 },
  'gpt-5.6-luna': { in: 0.1, out: 0.6 },
  'gpt-5.5': { in: 5.0, out: 30.0 },
  'gpt-5.4': { in: 2.5, out: 15.0 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'gpt-5.4-nano': { in: 0.2, out: 1.25 },
  'gpt-5.1': { in: 1.25, out: 10.0 },
  'gpt-5': { in: 1.25, out: 10.0 },
  'gpt-4.1': { in: 2.0, out: 8.0 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4o': { in: 2.5, out: 10.0 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'text-embedding-3-small': { in: 0.02, out: 0 },
  // Anthropic. Without an entry here `estimateCost` returns null and the whole
  // COST column renders "—", which reads as a broken feature rather than as the
  // "unpriced model" it actually is — so keep this list in step with the models
  // agents are actually configured with (see Settings → Agents).
  'claude-opus-5': { in: 5.0, out: 25.0 },
  'claude-opus-4-8': { in: 5.0, out: 25.0 },
  'claude-opus-4-7': { in: 5.0, out: 25.0 },
  'claude-sonnet-5': { in: 3.0, out: 15.0 },
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
  'claude-3-5-sonnet-latest': { in: 3.0, out: 15.0 },
  'claude-3-5-haiku-latest': { in: 0.8, out: 4.0 },
  'claude-3-opus-latest': { in: 15.0, out: 75.0 },
  // OpenRouter (CI runner, cheap models). Slugs + prices are APPROXIMATE and
  // must be confirmed against openrouter.ai/models before relying on cost.
  // Unknown slugs fall through to null cost (explicitly flagged), which is safe.
  'z-ai/glm-4.7-flash': { in: 0, out: 0 }, // free baseline for evals
  'deepseek/deepseek-v4-flash': { in: 0.14, out: 0.28 },
  'z-ai/glm-4.7-flashx': { in: 0.15, out: 0.4 },
  'minimax/minimax-m2.5': { in: 0.3, out: 1.2 },
  'z-ai/glm-5.1': { in: 0.6, out: 2.2 },
};

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

/**
 * Static per-model context window (tokens), APPROXIMATE — the R7 fallback for
 * when `ModelInfo.contextLength` is unpopulated, which is every model today
 * (`adapters/llm/anthropic.ts:92-101`, `adapters/llm/openai.ts:69-76` never
 * set it). specs/09-project-context.md R7.
 */
const CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.6-sol': 400_000,
  'gpt-5.6-terra': 400_000,
  'gpt-5.6-luna': 400_000,
  'gpt-5.5': 400_000,
  'gpt-5.4': 400_000,
  'gpt-5.4-mini': 400_000,
  'gpt-5.4-nano': 400_000,
  'gpt-5.1': 400_000,
  'gpt-5': 400_000,
  'gpt-4.1': 1_000_000,
  'gpt-4.1-mini': 1_000_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'claude-opus-5': 500_000,
  'claude-opus-4-8': 500_000,
  'claude-opus-4-7': 200_000,
  'claude-sonnet-5': 500_000,
  'claude-haiku-4-5': 200_000,
  'claude-3-5-sonnet-latest': 200_000,
  'claude-3-5-haiku-latest': 200_000,
  'claude-3-opus-latest': 200_000,
};

/**
 * Flat fallback when a model resolves through neither `ModelInfo.contextLength`
 * nor `CONTEXT_WINDOWS` (specs/09-project-context.md R7).
 */
export const FALLBACK_CONTEXT_WINDOW = 30_000;

/**
 * R7's window fallback chain: the provider-reported context length (when
 * populated), else the static table above, else the flat fallback. Reached
 * only through the container (`container.projectContext`'s injected
 * `resolveWindow`) — `injected-adapters-only-from-container` forbids a module
 * importing `adapters/llm/*` directly.
 */
export function resolveContextWindow(model: string, providerContextLength?: number | null): number {
  if (providerContextLength != null && providerContextLength > 0) return providerContextLength;
  return CONTEXT_WINDOWS[model] ?? FALLBACK_CONTEXT_WINDOW;
}
