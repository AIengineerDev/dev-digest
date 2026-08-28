import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { LLMProvider, Review, UnifiedDiff } from '@devdigest/shared';
import { assemblePrompt } from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';

const CACHE_DIR = join(homedir(), '.devdigest', 'review-cache');

export interface ReviewInput {
  systemPrompt: string;
  model: string;
  diff: UnifiedDiff;
  llm: LLMProvider;
  skills?: string[];
  task?: string;
  /** Reuse a cached review for an identical prompt. */
  cache?: boolean;
  /** Return the model's findings as-is, without the citation gate. */
  skipGrounding?: boolean;
}

export async function reviewPullRequest(input: ReviewInput) {
  const a = assemblePrompt({
    system: input.systemPrompt,
    skills: input.skills,
    diff: input.diff.raw,
    task: input.task,
  });
  const key = createHash('sha256').update(JSON.stringify(a.messages)).digest('hex');
  const cacheFile = join(CACHE_DIR, `${key}.json`);
  if (input.cache) {
    try {
      return JSON.parse(readFileSync(cacheFile, 'utf8'));
    } catch {
      // cold cache
    }
  }

  const res = await input.llm.completeStructured<Review>({
    model: input.model,
    messages: a.messages,
    schemaName: 'Review',
  });

  const ground = groundFindings(res.data.findings, input.diff);
  const out = {
    review: {
      ...res.data,
      findings: input.skipGrounding ? res.data.findings : ground.kept,
    },
    grounding: groundingSummary(ground),
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
  };

  if (input.cache) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(out));
  }
  return out;
}
