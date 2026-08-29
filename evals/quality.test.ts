/**
 * `pnpm eval:quality` — the blocking gate. No model, no key, no network.
 *
 * Errors fail the build. Warnings do not, and they are printed in one place for
 * every area rather than per describe block — an agent-only warning printed
 * inside the skills block is a warning nobody sees. Two kinds are expected to
 * stand for a while: skills that predate the harness and have no cases, and
 * links into `design-mocks/`, which is gitignored on purpose.
 */
import { describe, expect, it } from 'vitest';

import { checkAgents, checkProductSkills, checkSkills, type Issue } from './src/quality.js';

const show = (issues: Issue[]): string =>
  issues.map((i) => `  ${i.level.toUpperCase()} ${i.where} — ${i.what}`).join('\n');

const errorsOf = (issues: Issue[]): Issue[] => issues.filter((i) => i.level === 'error');

const skills = checkSkills();
const products = checkProductSkills();
const agents = checkAgents();

describe('skills are well-formed', () => {
  it('has no structural errors', () => {
    const errors = errorsOf(skills);
    expect(errors, `\n${show(errors)}\n`).toEqual([]);
  });
});

describe('product skill data is well-formed', () => {
  it('has no structural errors', () => {
    const errors = errorsOf(products);
    expect(errors, `\n${show(errors)}\n`).toEqual([]);
  });
});

describe('agents are well-formed', () => {
  it('has no structural errors', () => {
    const errors = errorsOf(agents);
    expect(errors, `\n${show(errors)}\n`).toEqual([]);
  });
});

describe('warnings', () => {
  it('are reported, not enforced', () => {
    const warnings = [...skills, ...products, ...agents].filter((i) => i.level === 'warning');
    if (warnings.length) process.stdout.write(`\n${show(warnings)}\n`);
    expect(Array.isArray(warnings)).toBe(true);
  });
});
