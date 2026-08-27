import type { LLMProvider, Review, UnifiedDiff } from '@devdigest/shared';
import { assemblePrompt } from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';

export interface ReviewInput {
  systemPrompt: string;
  model: string;
  diff: UnifiedDiff;
  llm: LLMProvider;
  skills?: string[];
  task?: string;
}

export async function reviewPullRequest(input: ReviewInput) {
  const a = assemblePrompt({
    system: input.systemPrompt,
    skills: input.skills,
    diff: input.diff.raw,
    task: input.task,
  });
  const res = await input.llm.completeStructured<Review>({
    model: input.model,
    messages: a.messages,
    schemaName: 'Review',
  });
  const ground = groundFindings(res.data.findings, input.diff);
  return {
    review: { ...res.data, findings: ground.kept },
    grounding: groundingSummary(ground),
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
  };
}
