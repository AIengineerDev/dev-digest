import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  Onboarding,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  Brief,
  BriefRecord,
  OnboardingSectionKind,
  OnboardingSection,
  TourRecord,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture_overview', title: 'T', body: 'b', links: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: {
        duration_ms: 8200,
        tokens_in: 14820,
        tokens_out: 1240,
        cost_usd: 0.06,
        findings: 3,
        grounding: '3/3 passed',
      },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });

  it('Brief / BriefRecord (specs/10-pr-brief.md) — full and degraded', () => {
    const fullBrief = {
      what: 'Adds a cached PR brief card.',
      why: 'Reviewers open a PR with no read-first summary.',
      risk_level: 'medium',
      risks: [
        {
          kind: 'concurrency',
          title: 'Two writers',
          explanation: 'Two POSTs could race.',
          severity: 'medium',
          file_refs: ['src/modules/brief/service.ts'],
        },
      ],
      review_focus: [{ kind: 'file', ref: 'src/modules/brief/service.ts', reason: 'New write path', line: 12 }],
    };
    expect(() => Brief.parse(fullBrief)).not.toThrow();

    const fullRecord = {
      ...fullBrief,
      pr_id: 'pr1',
      head_sha: 'abc123',
      intent_fingerprint: 'fp1',
      repo_indexed_sha: 'sha1',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      prompt_version: 1,
      tokens_in: 4200,
      tokens_out: 380,
      cost_usd: 0.01,
      budget_tokens: 8000,
      dropped_inputs: [],
      dropped_refs: 0,
      degraded: false,
      error: null,
      generated_at: '2026-08-18T00:00:00.000Z',
    };
    expect(() => BriefRecord.parse(fullRecord)).not.toThrow();

    const degradedRecord = {
      ...fullRecord,
      intent_fingerprint: null,
      repo_indexed_sha: null,
      cost_usd: null,
      degraded: true,
      error: 'llm_call_failed',
      generated_at: null,
    };
    expect(() => BriefRecord.parse(degradedRecord)).not.toThrow();
  });
});

describe('Onboarding tour contracts (specs/12-onboarding-generator.md)', () => {
  it('all five OnboardingSectionKind values parse', () => {
    for (const kind of [
      'architecture_overview',
      'critical_paths',
      'how_to_run',
      'guided_reading',
      'first_tasks',
    ] as const) {
      expect(() => OnboardingSectionKind.parse(kind)).not.toThrow();
    }
  });

  it('rejects a kind outside the five-section enum (A25)', () => {
    expect(() => OnboardingSectionKind.parse('not-a-section')).toThrow();
    expect(() =>
      OnboardingSection.parse({
        kind: 'not-a-section',
        title: 'T',
        body: null,
        links: [],
      }),
    ).toThrow();
  });

  const baseTrace = {
    budget_tokens: 10850,
    tokens_in: 11020,
    tokens_out: 900,
    cost_usd: 0.0024,
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    prompt_version: 'v1',
  };

  it('a fully-populated TourRecord parses', () => {
    const record = {
      sections: [
        {
          kind: 'architecture_overview',
          title: 'Architecture',
          body: 'This repo is organised around...',
          diagram: 'flowchart LR\nA-->B',
          links: [{ label: 'src', path: 'src/index.ts' }],
          tree: [
            {
              path: 'src',
              files: 12,
              role_mix: { core: 8, test: 4 },
              top_file: 'src/index.ts',
              note: 'entrypoint',
            },
          ],
        },
        {
          kind: 'critical_paths',
          title: 'Critical paths',
          body: 'The chains that most of the code depends on...',
          links: [],
          paths: [
            {
              chain_id: 'c1',
              files: ['src/a.ts', 'src/b.ts'],
              endpoints: ['GET /repos'],
              why: 'entrypoint chain',
              resolved: [true, true],
            },
          ],
        },
        {
          kind: 'how_to_run',
          title: 'How to run',
          body: 'Install then run.',
          links: [],
          run_steps: [{ command: 'pnpm install', why: 'install dependencies' }],
        },
        {
          kind: 'guided_reading',
          title: 'Guided reading',
          body: null,
          links: [],
          reading: [
            {
              path: 'src/index.ts',
              why: 'start here',
              rank_percentile: 95,
              resolved: true,
            },
          ],
        },
        {
          kind: 'first_tasks',
          title: 'First tasks',
          body: null,
          links: [],
          tasks: [
            {
              candidate_id: 'cand_1',
              title: 'Add a test',
              scope: 'src/index.ts',
              why: 'missing coverage',
              difficulty: 'low',
              difficulty_basis: { callers: 1, rank_percentile: 31, signal: 'indexed' },
              resolved: true,
            },
          ],
        },
      ],
      repo_id: 'repo_1',
      indexed_sha: 'abc1234',
      indexer_version: 2,
      prompt_version: 'v1',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      trace: baseTrace,
      degraded: false,
      error: null,
      skeleton_sections: [],
      dropped_inputs: [],
      dropped_refs: 0,
      dropped_steps: 0,
      index_status: 'full',
      files_skipped: 0,
      current_indexed_sha: 'abc1234',
      generated_at: '2026-08-26T00:00:00.000Z',
    };
    expect(() => TourRecord.parse(record)).not.toThrow();
  });

  it('a skeleton TourRecord parses — body null everywhere, tokens_in null, all five kinds skeletonised', () => {
    const skeletonKinds = [
      'architecture_overview',
      'critical_paths',
      'how_to_run',
      'guided_reading',
      'first_tasks',
    ] as const;
    const record = {
      sections: skeletonKinds.map((kind) => ({
        kind,
        title: kind,
        body: null,
        links: [],
        empty_reason: null,
        skeleton: true,
      })),
      repo_id: 'repo_1',
      indexed_sha: 'abc1234',
      indexer_version: 2,
      prompt_version: 'v1',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      trace: {
        ...baseTrace,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
      },
      degraded: true,
      error: 'input_over_budget',
      skeleton_sections: [...skeletonKinds],
      dropped_inputs: [],
      dropped_refs: 0,
      dropped_steps: 0,
      index_status: 'full',
      files_skipped: 0,
      current_indexed_sha: 'abc1234',
      generated_at: '2026-08-26T00:00:00.000Z',
    };
    const parsed = TourRecord.parse(record);
    expect(parsed.trace.tokens_in).toBeNull();
    expect(parsed.skeleton_sections).toHaveLength(5);
    expect(parsed.sections.every((s) => s.body === null)).toBe(true);
  });
});
