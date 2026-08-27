import { INJECTION_GUARD, wrapUntrusted } from './guard.js';

export interface PromptParts {
  system: string;
  skills?: string[];
  diff: string;
  task?: string;
}

export function assemblePrompt(parts: PromptParts) {
  const sections: string[] = [];
  if (parts.task) sections.push(parts.task);
  if (parts.skills?.length) {
    sections.push(`## Skills / rules\n${parts.skills.join('\n\n')}`);
  }
  sections.push(`## Diff to review\n${wrapUntrusted('diff', parts.diff)}`);
  return {
    messages: [
      { role: 'system' as const, content: `${parts.system}\n\n${INJECTION_GUARD}` },
      { role: 'user' as const, content: sections.join('\n\n') },
    ],
  };
}
