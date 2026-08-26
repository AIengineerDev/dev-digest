/**
 * A6/A7 — the 12 000-token pre-flight ceiling. `assembleTourInput` never
 * calls a model; that is what makes both cases assertable without a
 * container.
 */
import { describe, it, expect } from 'vitest';
import { assembleTourInput, tourSchemaEnvelope, type AssembleTourInput } from '../src/modules/tour/assemble.js';
import { TOUR_BUDGET_CEILING } from '../src/modules/tour/constants.js';

/** A crude but STABLE counter — proportional to length, deterministic, and
 *  (crucially) the SAME function used to measure and to re-measure, so A6's
 *  identity check is meaningful. */
function countingTokenizer(s: string): number {
  return Math.ceil(s.length / 4);
}

function baseInput(overrides: Partial<AssembleTourInput> = {}): AssembleTourInput {
  return {
    system: 'SYSTEM PROMPT TEXT',
    repoFacts: 'acme/widgets, TypeScript 92%, 340 files, 12 dirs, status: full',
    tree: [{ path: 'src', files: 10, roleMix: { core: 8, wiring: 2 }, topFile: 'src/index.ts', folded: [] }],
    directoryEdges: [{ from: 'src/api', to: 'src/lib' }],
    chains: [{ chain_id: 'chain_0', files: ['src/api/route.ts', 'src/lib/db.ts'], endpoints: ['GET /x'] }],
    documents: [{ path: 'README.md', content: 'This project does widgets.' }],
    rankedReading: [{ path: 'src/api/route.ts', rank_percentile: 95 }],
    symbolSignatures: [{ file: 'src/api/route.ts', symbol: 'handler', signature: '(req) => void' }],
    config: {
      packageManager: 'pnpm',
      scripts: ['dev', 'build'],
      envExampleVars: ['DATABASE_URL'],
      composeServices: ['db'],
      dockerfilePresent: true,
      whitelist: ['pnpm install', 'pnpm dev', 'docker compose up -d db'],
    },
    candidates: [{ candidate_id: 'c1', kind: 'missing_test', scope: 'src/util.ts', line: null, snippet: 'no test' }],
    difficultyInputs: [{ candidate_id: 'c1', callers: 1, rank_percentile: 20 }],
    count: countingTokenizer,
    ...overrides,
  };
}

describe('assembleTourInput', () => {
  it('A6 — measures ≤ 12 000, the measured string contains the serialized JSON schema, and re-measuring the returned messages equals `tokens`', () => {
    const result = assembleTourInput(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.tokens).toBeLessThanOrEqual(TOUR_BUDGET_CEILING);

    const envelope = tourSchemaEnvelope();
    const serializedSchema = envelope.split('\n').slice(2).join('\n'); // JSON.stringify(schema)
    // The schema is NOT part of system/user on its own — it only enters the
    // measured string via the envelope addend.
    expect(result.system + result.user).not.toContain(serializedSchema);
    const measuredString = result.system + result.user + envelope;
    expect(measuredString).toContain(serializedSchema);

    const remeasured = countingTokenizer(result.system + result.user + envelope);
    expect(remeasured).toBe(result.tokens);
  });

  it('A7 — an input still over budget after every droppable input is gone refuses, never calls a model', () => {
    // Chains (P5) are NEVER dropped — a huge, un-droppable block is what
    // makes the refusal survive exhausting the entire drop order, unlike a
    // huge droppable block (e.g. `tree`), which the drop order alone clears.
    const hugeChains = Array.from({ length: 5000 }, (_, i) => ({
      chain_id: `chain_${i}`,
      files: [`dir${i}/a.ts`, `dir${i}/b.ts`],
      endpoints: [`GET /x${i}`],
    }));
    const result = assembleTourInput(baseInput({ chains: hugeChains }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('input_over_budget');
  });

  it('drop order: a fixture ~500 tokens over drops documents (P6) FIRST, leaving chains/rankedReading/config/candidates intact', () => {
    // Push documents just large enough to force one drop step, small enough
    // that dropping documents alone is sufficient.
    const bigDoc = 'x'.repeat(TOUR_BUDGET_CEILING * 4 + 2000);
    const input = baseInput({ documents: [{ path: 'README.md', content: bigDoc }] });
    const result = assembleTourInput(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.droppedInputs).toEqual(['documents']);
    // P5/P7/P9/P10 (chains, rankedReading, config, candidates) are never dropped.
    expect(result.user).toContain('chain_0');
    expect(result.user).toContain('src/api/route.ts');
    expect(result.user).toContain('pnpm install');
    expect(result.user).toContain('c1');
  });
});
