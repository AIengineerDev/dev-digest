import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  ChatMessage,
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { toJsonSchema, parseWithRepair } from '../../platform/structured.js';
import { estimateCost } from './pricing.js';
import { ExternalServiceError } from '../../platform/errors.js';

/**
 * 240s, matching the OpenAI adapter. Thinking is on by default from Opus 4.7
 * onward and a single-pass review sends the whole diff in one call, so a large
 * PR runs well past a minute — an observed run spent 78k tokens and only just
 * fit inside 120s.
 *
 * Keep this STRICTLY BELOW `JobRunner.timeoutMs` (300s); equal values race and
 * the job is killed at the same instant this would have failed.
 */
export const DEFAULT_TIMEOUT = 240_000;
const DEFAULT_MAX_TOKENS = 4096;
/**
 * Models that removed sampling params think by default, and `max_tokens` caps
 * thinking + response text together — 4096 truncates a review mid-answer.
 */
const REASONING_MAX_TOKENS = 16_384;

/**
 * Claude Opus 4.7 and later (Opus 4.7/4.8/5, Sonnet 5, Fable 5) REMOVED the
 * sampling params: sending `temperature`, `top_p`, or `top_k` returns a 400
 * `invalid_request_error` reading "`temperature` is deprecated for this model".
 * Deprecated here means rejected, not ignored — the key must be absent, not 0.
 *
 * Mirrors `isReasoningModel` in the OpenAI adapter, which solves the same
 * problem for gpt-5 and the o-series. Match on the model family rather than an
 * exact id so a new point release doesn't silently start 400ing.
 */
function rejectsSampling(model: string): boolean {
  return /claude-(opus-(4-7|4-8|5)|sonnet-5|fable-5|mythos-5)/.test(model);
}

/** Build the sampling + token-cap params appropriate for the given model. */
export function tuningParams(
  model: string,
  temperature: number | undefined,
  maxTokens: number | undefined,
): { max_tokens: number; temperature?: number } {
  if (rejectsSampling(model)) {
    return { max_tokens: maxTokens ?? REASONING_MAX_TOKENS };
  }
  return {
    max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: temperature ?? 0,
  };
}

/** Anthropic has no embeddings API; embeddings come from the OpenAI Embedder. */
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

/**
 * Anthropic LLMProvider.
 * - listModels: dynamic via GET /models.
 * - completeStructured: FORCED tool-use (single tool, input_schema = our JSON
 *   schema, tool_choice forces it), parse tool_use.input, Zod validate + reprompt.
 * - embed: NOT supported (throws) — use the OpenAI Embedder for vectors.
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async listModels(): Promise<ModelInfo[]> {
    return withRetry(async () => {
      // SDK 0.33 exposes models.list()
      const res = await this.client.models.list();
      return res.data.map((m) => ({
        id: m.id,
        provider: 'anthropic' as const,
        label: m.display_name,
      }));
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return withRetry(() => withTimeout(this.doComplete(req), req.timeoutMs ?? DEFAULT_TIMEOUT));
  }

  private async doComplete(req: CompletionRequest): Promise<CompletionResult> {
    const { system, rest } = splitSystem(req.messages);
    const res = await this.client.messages.create({
      model: req.model,
      system: system || undefined,
      messages: rest,
      ...tuningParams(req.model, req.temperature ?? 0.2, req.maxTokens),
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const tokensIn = res.usage.input_tokens;
    const tokensOut = res.usage.output_tokens;
    return {
      text,
      model: req.model,
      tokensIn,
      tokensOut,
      costUsd: estimateCost(req.model, tokensIn, tokensOut),
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

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const res = await withRetry(() =>
        withTimeout(
          this.client.messages.create({
            model: req.model,
            system: system || undefined,
            messages,
            ...tuningParams(req.model, req.temperature, req.maxTokens),
            tools: [
              {
                name: toolName,
                description: `Return the result as ${req.schemaName}.`,
                input_schema: jsonSchema.schema as Anthropic.Tool.InputSchema,
              },
            ],
            tool_choice: { type: 'tool', name: toolName },
          }),
          req.timeoutMs ?? DEFAULT_TIMEOUT,
        ),
      );
      tokensIn += res.usage.input_tokens;
      tokensOut += res.usage.output_tokens;

      const toolUse = res.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
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
      messages.push({ role: 'assistant', content: res.content });
      // The reprompt MUST come back as a `tool_result` for the tool_use we just
      // received. Anthropic rejects the next request outright when a `tool_use`
      // block is not answered by a matching `tool_result` in the very next
      // message ("`tool_use` ids were found without `tool_result` blocks
      // immediately after"), so sending the validation error as plain user text
      // turns a recoverable schema miss into a hard 400 on attempt two.
      // `is_error` is what tells the model this is a failure to correct rather
      // than data to keep reasoning from.
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
          : // No tool_use block came back at all (the model answered in prose),
            // so there is nothing to pair with and plain text is the valid shape.
            parsed.repromptMessage,
      });
    }

    throw new ExternalServiceError('Anthropic structured output failed schema validation', {
      raw: lastRaw,
    });
  }

  async embed(): Promise<number[][]> {
    throw new ExternalServiceError(
      'Anthropic does not provide embeddings; use the OpenAI Embedder.',
    );
  }
}
