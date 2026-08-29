import { describe, it, expect } from 'vitest';
import { selectTargets } from '../src/modules/reviews/helpers.js';
import { RunRequest } from '@devdigest/shared';
import type { AgentRow } from '../src/db/rows.js';

/**
 * C1 — subset resolution. Precedence `agentIds > agentId > all`, de-duplication,
 * disabled/unknown-id drop, and the schema-level `max(8)` cost fuse. Pure —
 * `selectTargets` never touches the DB.
 */

function agent(id: string, name = id): AgentRow {
  return { id, name } as never as AgentRow;
}

const a = agent('a');
const b = agent('b');
const c = agent('c');
const enabled = [a, b, c];
const byId = new Map([
  ['a', a],
  ['b', b],
  ['c', c],
]);

describe('selectTargets', () => {
  it('agentIds takes precedence over agentId and all — never resolves to five', () => {
    const { targets } = selectTargets({ agentIds: ['a', 'b'], agentId: 'c', all: true }, enabled, byId);
    expect(targets.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('de-duplicates repeated ids in agentIds', () => {
    const { targets } = selectTargets({ agentIds: ['a', 'a', 'b'] }, enabled, byId);
    expect(targets.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('drops a disabled/unknown id with a reason, while the rest still run', () => {
    const disabledByIdOnly = new Map([['a', a]]); // 'b' unknown to byId
    const { targets, dropped } = selectTargets({ agentIds: ['a', 'b'] }, [a], disabledByIdOnly);
    expect(targets.map((t) => t.id)).toEqual(['a']);
    expect(dropped).toEqual([{ agentId: 'b', reason: 'unknown' }]);
  });

  it('drops an id that exists but is not enabled', () => {
    const { targets, dropped } = selectTargets({ agentIds: ['a', 'b'] }, [a], byId);
    expect(targets.map((t) => t.id)).toEqual(['a']);
    expect(dropped).toEqual([{ agentId: 'b', reason: 'disabled' }]);
  });

  it('an empty survivor set resolves to no targets (caller 400s, never a silent all)', () => {
    const { targets } = selectTargets({ agentIds: ['x', 'y'], all: true }, enabled, byId);
    expect(targets).toEqual([]);
  });

  it('falls back to agentId when agentIds is absent', () => {
    const { targets } = selectTargets({ agentId: 'c' }, enabled, byId);
    expect(targets.map((t) => t.id)).toEqual(['c']);
  });

  it('falls back to all when neither agentIds nor agentId is set', () => {
    const { targets } = selectTargets({ all: true }, enabled, byId);
    expect(targets).toEqual(enabled);
  });

  it('nine ids fail RunRequest.parse at the schema — the max(8) fuse', () => {
    const nineIds = Array.from({ length: 9 }, (_, i) => `agent-${i}`);
    expect(() => RunRequest.parse({ agentIds: nineIds })).toThrow();
  });

  it('eight ids parse fine — the fuse is exactly at 8', () => {
    const eightIds = Array.from({ length: 8 }, (_, i) => `agent-${i}`);
    expect(() => RunRequest.parse({ agentIds: eightIds })).not.toThrow();
  });
});
