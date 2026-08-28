import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { toJsonSchema, parseWithRepair } from '@devdigest/reviewer-core';

/**
 * The eval harness's own LLM provider.
 *
 * A deliberate near-copy of `server/src/adapters/llm/anthropic.ts`, not an
 * import of it: importing the server's adapter drags `platform/resilience`,
 * `platform/errors` and the pricing table into this program, and with them the
 * whole server package as a CI dependency. This package depends on the ENGINE
 * (`reviewer-core`) and the CONTRACTS (`vendor/shared`) — never on the server.
 *
 * Two behaviours are copied on purpose because the eval is meaningless without
 * them: models from Opus 4.7 on reject `temperature`, and structured output is
 * a FORCED tool call re-prompted through a `tool_result` on schema failure.
 */

/** Anthropic list prices, USD per 1M tokens. Drifts — verify before quoting. */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

const DEFAULT_TIMEOUT = 240_000;
const REASONING_MAX_TOKENS = 16_384;

/** Opus 4.7+ / Sonnet 5 / Fable 5 removed the sampling params: sending
    `temperature` at all returns a 400, so the key must be absent, not zero. */
function rejectsSampling(model: string): boolean {
  return /claude-(opus-(4-7|4-8|5)|sonnet-5|fable-5|mythos-5)/.test(model);
}

function tuning(model: string, temperature?: number, maxTokens?: number) {
  if (rejectsSampling(model)) return { max_tokens: maxTokens ?? REASONING_MAX_TOKENS };
  return { max_tokens: maxTokens ?? REASONING_MAX_TOKENS, temperature: temperature ?? 0 };
}

function estimateCost(model: string, tokensIn: number, tokensOut: number): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

function splitSystem(messages: ChatMessage[]): {
  system: string;
  rest: Anthropic.MessageParam[];
} {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return { system, rest };
}

export class EvalAnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;

  /**
   * Structured-output attempts used by the last completeStructured call.
   * `reviewPullRequest` does not surface `attempts` from `StructuredResult`, and
   * a retry is otherwise invisible: it shows up only as `tokensIn` roughly
   * doubling, because the retry loop below ACCUMULATES usage. Three of five
   * runs of one arm silently cost two calls each before this was exposed.
   */
  lastAttempts = 0;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, timeout: DEFAULT_TIMEOUT });
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.client.models.list();
    return res.data.map((m) => ({ id: m.id, provider: 'anthropic' as const, label: m.display_name }));
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const { system, rest } = splitSystem(req.messages);
    const res = await this.client.messages.create({
      model: req.model,
      system: system || undefined,
      messages: rest,
      ...tuning(req.model, req.temperature, req.maxTokens),
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text,
      model: req.model,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
      costUsd: estimateCost(req.model, res.usage.input_tokens, res.usage.output_tokens),
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const toolName = req.schemaName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const maxRetries = req.maxRetries ?? 2;
    const { system, rest } = splitSystem(req.messages);
    const messages: Anthropic.MessageParam[] = [...rest];
    let tokensIn = 0;
    let tokensOut = 0;
    let lastRaw = '';

    this.lastAttempts = 0;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      this.lastAttempts = attempt;
      const res = await this.client.messages.create({
        model: req.model,
        system: system || undefined,
        messages,
        ...tuning(req.model, req.temperature, req.maxTokens),
        tools: [
          {
            name: toolName,
            description: `Return the result as ${req.schemaName}.`,
            input_schema: jsonSchema.schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: toolName },
      });
      tokensIn += res.usage.input_tokens;
      tokensOut += res.usage.output_tokens;

      const toolUse = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      lastRaw = toolUse ? JSON.stringify(toolUse.input) : '';

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: estimateCost(req.model, tokensIn, tokensOut),
          raw: lastRaw,
          attempts: attempt,
        };
      }

      // The reprompt MUST answer the tool_use with a tool_result or the next
      // request is rejected outright — a recoverable schema miss would turn
      // into a hard 400 on attempt two.
      messages.push({ role: 'assistant', content: res.content });
      messages.push({
        role: 'user',
        content: toolUse
          ? [
              {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                is_error: true,
                content: parsed.repromptMessage,
              },
            ]
          : parsed.repromptMessage,
      });
    }

    throw new Error(
      `Anthropic structured output failed schema validation after ${maxRetries + 1} attempts`,
    );
  }

  async embed(): Promise<number[][]> {
    throw new Error('the eval harness does not embed');
  }
}
