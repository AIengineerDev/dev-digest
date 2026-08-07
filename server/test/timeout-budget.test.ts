import { describe, it, expect } from 'vitest';
import { DEFAULT_TIMEOUT as OPENAI_TIMEOUT } from '../src/adapters/llm/openai.js';
import { DEFAULT_TIMEOUT as ANTHROPIC_TIMEOUT } from '../src/adapters/llm/anthropic.js';
import { DEFAULT_JOB_TIMEOUT } from '../src/platform/jobs.js';

/**
 * The nesting of these three budgets is load-bearing, and getting it wrong is
 * silent: nothing crashes, reviews just fail with a confusing error.
 *
 * - Adapter below job runner: whichever fires first owns the error message. When
 *   the adapter wins, the run reports the provider timeout it actually hit; when
 *   they are EQUAL they race, and a review that timed out in the provider is
 *   reported as a generic job timeout instead. That equality is exactly the state
 *   this repo was left in at 120s/120s.
 * - Both well above a minute: a single-pass review sends the whole diff in one
 *   call (~129k input tokens on a large PR), which no frontier model finishes in
 *   60s. Three separate outages here were all "the number was too small".
 */
describe('timeout budget', () => {
  it('keeps every LLM adapter strictly below the job runner', () => {
    expect(OPENAI_TIMEOUT).toBeLessThan(DEFAULT_JOB_TIMEOUT);
    expect(ANTHROPIC_TIMEOUT).toBeLessThan(DEFAULT_JOB_TIMEOUT);
  });

  it('leaves the adapters enough headroom for a single-pass review', () => {
    expect(OPENAI_TIMEOUT).toBeGreaterThanOrEqual(120_000);
    expect(ANTHROPIC_TIMEOUT).toBeGreaterThanOrEqual(120_000);
  });

  it('keeps the two adapters in step so the slow one is not the odd link', () => {
    expect(OPENAI_TIMEOUT).toBe(ANTHROPIC_TIMEOUT);
  });
});
