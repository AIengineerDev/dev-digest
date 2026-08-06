import { describe, it, expect } from 'vitest';
import { tuningParams } from './anthropic.js';

/**
 * The regression these pin: Claude Opus 4.7+ REJECTS `temperature` with a 400
 * rather than ignoring it, so the key must be absent from the payload — not
 * present and set to 0. `toHaveProperty` would pass on `{temperature: 0}`,
 * hence the explicit `in` checks.
 */
describe('tuningParams', () => {
  const rejecting = ['claude-opus-5', 'claude-opus-4-7', 'claude-opus-4-8', 'claude-sonnet-5'];

  for (const model of rejecting) {
    it(`omits temperature entirely for ${model}`, () => {
      const p = tuningParams(model, 0.2, undefined);
      expect('temperature' in p).toBe(false);
      expect('top_p' in p).toBe(false);
      expect('top_k' in p).toBe(false);
    });
  }

  it('still omits temperature when a caller passes one explicitly', () => {
    expect('temperature' in tuningParams('claude-opus-5', 0.7, 1000)).toBe(false);
  });

  it('gives sampling-free models headroom for thinking + response text', () => {
    // 4096 truncates a review mid-answer once thinking shares the budget.
    expect(tuningParams('claude-opus-5', 0.2, undefined).max_tokens).toBe(16_384);
  });

  it('honours an explicit maxTokens on a sampling-free model', () => {
    expect(tuningParams('claude-opus-5', 0.2, 2048).max_tokens).toBe(2048);
  });

  it('keeps temperature for older models that still accept it', () => {
    const p = tuningParams('claude-3-5-sonnet-20241022', 0.2, undefined);
    expect(p.temperature).toBe(0.2);
    expect(p.max_tokens).toBe(4096);
  });

  it('defaults temperature to 0 for older models when none is given', () => {
    expect(tuningParams('claude-3-5-sonnet-20241022', undefined, undefined).temperature).toBe(0);
  });
});
