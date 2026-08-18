import { describe, it, expect } from 'vitest';
import { groundBrief } from '../src/modules/brief/grounding.js';
import type { Brief } from '@devdigest/shared';

/**
 * R4's mechanical grounding gate. Pure — no container, no DB — so the
 * reference-set membership rule can be pinned without the assembly or the
 * model that produces a `Brief` in the first place.
 */
function briefWith(overrides: Partial<Brief>): Brief {
  return {
    what: 'Adds rate limiting to public endpoints.',
    why: 'Prevents abuse of unauthenticated routes.',
    risk_level: 'medium',
    risks: [],
    review_focus: [],
    ...overrides,
  };
}

describe('groundBrief — R4 the mechanical reference-set gate', () => {
  it('A2 — an invented file ref is dropped and counted; a real one survives', () => {
    const brief = briefWith({
      risks: [
        {
          kind: 'security',
          title: 'No rate-limit bypass check',
          explanation: 'A header could bypass the limiter.',
          severity: 'high',
          file_refs: ['src/middleware/ratelimit.ts', 'src/does-not-exist.ts'],
        },
      ],
    });

    const result = groundBrief({
      brief,
      referenceFiles: ['src/middleware/ratelimit.ts'],
      referenceEndpoints: [],
    });

    expect(result.brief.risks[0]!.file_refs).toEqual(['src/middleware/ratelimit.ts']);
    expect(result.dropped).toContain('src/does-not-exist.ts');
    expect(result.droppedRefs).toBe(1);
  });

  it('normalises a stray leading "./" on either side so it cannot drop every ref', () => {
    const brief = briefWith({
      risks: [
        {
          kind: 'perf',
          title: 'N+1 query',
          explanation: 'Loop issues one query per row.',
          severity: 'medium',
          file_refs: ['./src/api/handler.ts'],
        },
      ],
    });

    const result = groundBrief({
      brief,
      referenceFiles: ['src/api/handler.ts'],
      referenceEndpoints: [],
    });

    expect(result.brief.risks[0]!.file_refs).toEqual(['./src/api/handler.ts']);
    expect(result.droppedRefs).toBe(0);
  });

  it('review_focus: a "file" entry is checked against files, an "endpoint" entry against endpoints', () => {
    const brief = briefWith({
      review_focus: [
        { kind: 'file', ref: 'src/middleware/ratelimit.ts', reason: 'core change' },
        { kind: 'file', ref: 'src/invented.ts', reason: 'invented' },
        { kind: 'endpoint', ref: 'POST /webhooks', reason: 'affected endpoint' },
        { kind: 'endpoint', ref: 'GET /invented', reason: 'invented' },
      ],
    });

    const result = groundBrief({
      brief,
      referenceFiles: ['src/middleware/ratelimit.ts'],
      referenceEndpoints: ['POST /webhooks'],
    });

    expect(result.brief.review_focus.map((e) => e.ref)).toEqual(['src/middleware/ratelimit.ts', 'POST /webhooks']);
    expect(result.droppedRefs).toBe(2);
    expect(result.focusReturned).toBe(4);
    expect(result.focusKept).toBe(2);
  });

  it('C2 vs C13 — the counts distinguish "the model said nothing" from "everything it said was wrong"', () => {
    const emptyFocus = groundBrief({ brief: briefWith({ review_focus: [] }), referenceFiles: [], referenceEndpoints: [] });
    expect(emptyFocus.focusReturned).toBe(0);
    expect(emptyFocus.focusKept).toBe(0);
    // C2: a genuinely empty focus list is NOT what makes a caller degrade —
    // `returned.length > 0 && kept.length === 0` must be false here.
    expect(emptyFocus.focusReturned > 0 && emptyFocus.focusKept === 0).toBe(false);

    const allWrong = groundBrief({
      brief: briefWith({
        review_focus: [
          { kind: 'file', ref: 'src/invented-1.ts', reason: 'a' },
          { kind: 'file', ref: 'src/invented-2.ts', reason: 'b' },
        ],
      }),
      referenceFiles: ['src/real.ts'],
      referenceEndpoints: [],
    });
    expect(allWrong.focusReturned).toBe(2);
    expect(allWrong.focusKept).toBe(0);
    // C13: every entry failed grounding — this IS the degrade condition.
    expect(allWrong.focusReturned > 0 && allWrong.focusKept === 0).toBe(true);
  });
});
