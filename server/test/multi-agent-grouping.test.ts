import { describe, it, expect } from 'vitest';
import { groupFindings } from '../src/modules/reviews/grouping.js';
import type { FindingRecord } from '@devdigest/shared';

/**
 * R3/N3 — pure grouping: file + overlapping line-range join, silent takes for
 * every agent in the run, and the conflict flag. No DB, no model.
 */

function finding(o: Partial<FindingRecord> & Pick<FindingRecord, 'id' | 'file' | 'start_line' | 'end_line'>): FindingRecord {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: `finding ${o.id}`,
    rationale: 'because',
    suggestion: null,
    confidence: 0.8,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    review_id: 'review-1',
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe('groupFindings', () => {
  it('spec:200-203 fixture — two flag an overlapping range, one is silent', () => {
    const a = finding({ id: 'a1', file: 'ratelimit.ts', start_line: 50, end_line: 54, severity: 'CRITICAL' });
    const b = finding({ id: 'b1', file: 'ratelimit.ts', start_line: 52, end_line: 52, severity: 'WARNING' });
    const groups = groupFindings([
      { agent_id: 'agent-a', agent_name: 'Security', findings: [a] },
      { agent_id: 'agent-b', agent_name: 'Correctness', findings: [b] },
      { agent_id: 'agent-c', agent_name: 'Style', findings: [] },
    ]);

    expect(groups).toHaveLength(1);
    const group = groups[0]!;
    expect(group.file).toBe('ratelimit.ts');
    expect(group.anchor_start).toBe(50);
    expect(group.anchor_end).toBe(54);
    expect(group.conflict).toBe(true);
    expect(group.takes).toHaveLength(3);
    // highest-severity member (CRITICAL) supplies the title
    expect(group.title).toBe(a.title);

    const byAgent = new Map(group.takes.map((t) => [t.agent_id, t]));
    expect(byAgent.get('agent-a')?.finding?.id).toBe('a1');
    expect(byAgent.get('agent-b')?.finding?.id).toBe('b1');
    expect(byAgent.get('agent-c')?.finding).toBeNull();
  });

  it('same line numbers in different files never group', () => {
    const a = finding({ id: 'a1', file: 'foo.ts', start_line: 10, end_line: 12 });
    const b = finding({ id: 'b1', file: 'bar.ts', start_line: 10, end_line: 12 });
    const groups = groupFindings([
      { agent_id: 'agent-a', agent_name: 'A', findings: [a] },
      { agent_id: 'agent-b', agent_name: 'B', findings: [b] },
    ]);
    expect(groups).toHaveLength(2);
  });

  it('a 1..EOF finding absorbs other findings in the file; title is by severity, not width', () => {
    const wide = finding({
      id: 'wide',
      file: 'big.ts',
      start_line: 1,
      end_line: 10_000,
      severity: 'SUGGESTION',
      title: 'File-wide style pass',
    });
    const narrow = finding({
      id: 'narrow',
      file: 'big.ts',
      start_line: 42,
      end_line: 42,
      severity: 'CRITICAL',
      title: 'SQL injection',
    });
    const groups = groupFindings([
      { agent_id: 'agent-a', agent_name: 'A', findings: [wide] },
      { agent_id: 'agent-b', agent_name: 'B', findings: [narrow] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.title).toBe('SQL injection');
    expect(groups[0]!.anchor_start).toBe(1);
    expect(groups[0]!.anchor_end).toBe(10_000);
  });

  it('an agent absent from the input never appears as a take', () => {
    const a = finding({ id: 'a1', file: 'foo.ts', start_line: 1, end_line: 1 });
    const groups = groupFindings([{ agent_id: 'agent-a', agent_name: 'A', findings: [a] }]);
    expect(groups[0]!.takes).toHaveLength(1);
    expect(groups[0]!.takes[0]!.agent_id).toBe('agent-a');
  });

  it('unanimous agreement is not a conflict', () => {
    const a = finding({ id: 'a1', file: 'foo.ts', start_line: 1, end_line: 3 });
    const b = finding({ id: 'b1', file: 'foo.ts', start_line: 2, end_line: 2 });
    const groups = groupFindings([
      { agent_id: 'agent-a', agent_name: 'A', findings: [a] },
      { agent_id: 'agent-b', agent_name: 'B', findings: [b] },
    ]);
    expect(groups[0]!.conflict).toBe(false);
  });
});
