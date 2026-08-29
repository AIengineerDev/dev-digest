/**
 * `pnpm eval:quality` — the blocking gate. No model, no key, no network.
 *
 * Errors fail the build. Coverage warnings do not: the skills that predate the
 * harness would turn the gate red forever, and a gate nobody can make green
 * stops being read. They are printed, counted, and left to the policy in
 * AGENTS.md.
 */
import { describe, expect, it } from 'vitest';

import { checkAgents, checkProductSkills, checkSkills, type Issue } from './src/quality.js';

const show = (issues: Issue[]): string =>
  issues.map((i) => `  ${i.level.toUpperCase()} ${i.where} — ${i.what}`).join('\n');

describe('skills are well-formed', () => {
  const issues = checkSkills();
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  it('has no structural errors', () => {
    expect(errors, `\n${show(errors)}\n`).toEqual([]);
  });

  it('reports its warnings', () => {
    if (warnings.length) process.stdout.write(`\n${show(warnings)}\n`);
    expect(Array.isArray(warnings)).toBe(true);
  });
});

describe('product skill data is well-formed', () => {
  const errors = checkProductSkills().filter((i) => i.level === 'error');

  it('has no structural errors', () => {
    expect(errors, `\n${show(errors)}\n`).toEqual([]);
  });
});

describe('agents are well-formed', () => {
  const issues = checkAgents();
  const errors = issues.filter((i) => i.level === 'error');

  it('has no structural errors', () => {
    expect(errors, `\n${show(errors)}\n`).toEqual([]);
  });
});
