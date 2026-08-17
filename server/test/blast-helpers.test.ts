import { describe, it, expect } from 'vitest';
import { summarize, toBlastRadius, type BlastResultLike } from '../src/modules/blast/helpers.js';
import {
  MAX_CALLERS_PER_SYMBOL,
  MAX_CHANGED_SYMBOLS,
} from '../src/modules/blast/constants.js';

/**
 * The one substantive transformation in the blast module: the facade returns a
 * FLAT caller list tagged with `viaSymbol`, the contract wants it grouped per
 * changed symbol. Everything the UI and the MCP tool read comes out of here, so
 * it is tested without a database, a clone or an index.
 */

const sym = (name: string, file = 'src/a.ts') => ({ file, name, kind: 'function' });
const caller = (symbol: string, viaSymbol: string, file: string, line = 10) => ({
  file,
  symbol,
  viaSymbol,
  line,
});

describe('toBlastRadius', () => {
  it('groups a flat caller list under the changed symbol each caller reaches', () => {
    const result: BlastResultLike = {
      changedSymbols: [sym('rateLimit'), sym('bucketKey')],
      callers: [
        caller('handler', 'rateLimit', 'src/server.ts', 40),
        caller('webhook', 'rateLimit', 'src/api/webhooks.ts', 12),
        caller('rateLimit', 'bucketKey', 'src/middleware/ratelimit.ts', 26),
      ],
      impactedEndpoints: [],
    };
    const blast = toBlastRadius(result);

    // Most-called first — the symbol that needs the most thought is on top.
    expect(blast.downstream.map((d) => d.symbol)).toEqual(['rateLimit', 'bucketKey']);
    expect(blast.downstream[0]!.callers).toEqual([
      { name: 'webhook', file: 'src/api/webhooks.ts', line: 12 },
      { name: 'handler', file: 'src/server.ts', line: 40 },
    ]);
    expect(blast.downstream[1]!.callers).toHaveLength(1);
  });

  it('gives a changed symbol nobody calls an empty caller list, not no entry', () => {
    // "Changed and called by nothing" is a real, useful answer — dropping the
    // row would make it indistinguishable from "not analysed".
    const blast = toBlastRadius({
      changedSymbols: [sym('orphan')],
      callers: [],
      impactedEndpoints: [],
    });
    expect(blast.downstream).toEqual([
      { symbol: 'orphan', callers: [], endpoints_affected: [], crons_affected: [] },
    ]);
  });

  it('attributes endpoints per caller file when the persistent index supplies facts', () => {
    const blast = toBlastRadius({
      changedSymbols: [sym('rateLimit'), sym('bucketKey')],
      callers: [
        caller('handler', 'rateLimit', 'src/server.ts'),
        caller('rateLimit', 'bucketKey', 'src/middleware/ratelimit.ts'),
      ],
      impactedEndpoints: ['GET /health', 'POST /webhooks'],
      factsByFile: {
        'src/server.ts': { endpoints: ['GET /health'], crons: ['nightly-sweep'] },
        'src/middleware/ratelimit.ts': { endpoints: ['POST /webhooks'], crons: [] },
      },
    });
    const byName = new Map(blast.downstream.map((d) => [d.symbol, d]));
    expect(byName.get('rateLimit')!.endpoints_affected).toEqual(['GET /health']);
    expect(byName.get('rateLimit')!.crons_affected).toEqual(['nightly-sweep']);
    expect(byName.get('bucketKey')!.endpoints_affected).toEqual(['POST /webhooks']);
  });

  it('falls back to the flat union — never to zero — when facts are absent', () => {
    // The degraded path has no per-file attribution. The endpoints are real;
    // only their owner is unknown, and reporting none would hide them.
    const blast = toBlastRadius({
      changedSymbols: [sym('rateLimit')],
      callers: [caller('handler', 'rateLimit', 'src/server.ts')],
      impactedEndpoints: ['GET /health', 'GET /health'],
      degraded: true,
    });
    expect(blast.downstream[0]!.endpoints_affected).toEqual(['GET /health']);
    expect(blast.summary).toContain('approximate');
  });

  it('caps the caller list but counts every caller in the summary', () => {
    const many = Array.from({ length: MAX_CALLERS_PER_SYMBOL + 8 }, (_, i) =>
      caller(`c${i}`, 'hot', `src/f${String(i).padStart(2, '0')}.ts`),
    );
    const blast = toBlastRadius({
      changedSymbols: [sym('hot')],
      callers: many,
      impactedEndpoints: [],
    });
    expect(blast.downstream[0]!.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    // The card says "20 callers" and lists 12; the two must not contradict.
    expect(blast.summary).toContain(`${many.length} callers`);
  });

  it('caps the changed-symbol list too', () => {
    const blast = toBlastRadius({
      changedSymbols: Array.from({ length: MAX_CHANGED_SYMBOLS + 5 }, (_, i) => sym(`s${i}`)),
      callers: [],
      impactedEndpoints: [],
    });
    expect(blast.changed_symbols).toHaveLength(MAX_CHANGED_SYMBOLS);
    expect(blast.downstream).toHaveLength(MAX_CHANGED_SYMBOLS);
    expect(blast.summary).toContain(`${MAX_CHANGED_SYMBOLS + 5} changed symbols`);
  });

  it('orders callers by file then line, so repeated requests agree', () => {
    const blast = toBlastRadius({
      changedSymbols: [sym('x')],
      callers: [
        caller('c', 'x', 'src/b.ts', 5),
        caller('a', 'x', 'src/a.ts', 90),
        caller('b', 'x', 'src/a.ts', 3),
      ],
      impactedEndpoints: [],
    });
    expect(blast.downstream[0]!.callers.map((c) => `${c.file}:${c.line}`)).toEqual([
      'src/a.ts:3',
      'src/a.ts:90',
      'src/b.ts:5',
    ]);
  });
});

describe('summarize', () => {
  it('distinguishes "no symbols changed" from "the index could not say"', () => {
    expect(summarize({ symbols: 0, callers: 0, endpoints: 0 }, {})).toContain(
      'No exported symbols changed',
    );
    expect(summarize({ symbols: 0, callers: 0, endpoints: 0 }, { degraded: true })).toContain(
      'a floor, not a finding',
    );
  });

  it('names the unimported-PR state rather than reporting an empty impact', () => {
    const s = summarize({ symbols: 0, callers: 0, endpoints: 0 }, { noFiles: true });
    expect(s).toContain('No changed files recorded');
    expect(s).toContain('open it once');
  });

  it('singularises counts of one', () => {
    expect(summarize({ symbols: 1, callers: 1, endpoints: 1 }, {})).toBe(
      '1 changed symbol · 1 caller · 1 endpoint.',
    );
  });
});
