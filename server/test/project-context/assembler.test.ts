import { describe, it, expect } from 'vitest';
import { MockGitClient } from '../../src/adapters/mocks.js';
import { TiktokenTokenizer } from '../../src/adapters/tokenizer/index.js';
import { resolveContextWindow, FALLBACK_CONTEXT_WINDOW } from '../../src/adapters/llm/pricing.js';
import { ProjectContextAssembler, type AttachmentSource } from '../../src/modules/project-context/assembler.js';
import type { AttachmentRow } from '../../src/modules/project-context/repository.js';

const ref = { owner: 'acme', name: 'widgets' };
const repoId = 'repo-1';

/** In-memory stand-in for `ProjectContextRepository` — the interface the
 *  assembler actually depends on (`AttachmentSource`), no DB needed. */
class FakeAttachmentSource implements AttachmentSource {
  constructor(private rows: AttachmentRow[]) {}
  async attachmentsForTargets(
    _repoId: string,
    targets: Array<{ kind: 'agent' | 'skill'; id: string }>,
  ): Promise<AttachmentRow[]> {
    const wanted = new Set(targets.map((t) => `${t.kind}:${t.id}`));
    return this.rows.filter((r) => wanted.has(`${r.targetKind}:${r.targetId}`));
  }
}

function makeAssembler(rows: AttachmentRow[], files: Record<string, string>) {
  const git = new MockGitClient({ files });
  const tokenizer = new TiktokenTokenizer();
  return new ProjectContextAssembler(new FakeAttachmentSource(rows), git, tokenizer, resolveContextWindow);
}

describe('ProjectContextAssembler', () => {
  it('C11 — a doc attached to both an agent and its linked skill is injected once, counted once, both sources listed', async () => {
    const rows: AttachmentRow[] = [
      { path: 'docs/prd.md', targetKind: 'agent', targetId: 'agent-1', order: 0 },
      { path: 'docs/prd.md', targetKind: 'skill', targetId: 'skill-1', order: 0 },
    ];
    const assembler = makeAssembler(rows, { 'docs/prd.md': '# PRD\n\nRate limit everything.' });

    const result = await assembler.assemble(
      ref,
      repoId,
      [
        { kind: 'agent', id: 'agent-1' },
        { kind: 'skill', id: 'skill-1', name: 'onboarding-rules', enabled: true },
      ],
      'claude-sonnet-5',
    );

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ source: 'docs/prd.md' });
    expect(result.used).toHaveLength(1);
    expect(result.used[0]).toMatchObject({
      path: 'docs/prd.md',
      status: 'injected',
      sources: expect.arrayContaining(['agent', 'skill:onboarding-rules']),
    });
    expect(result.used[0]!.sources).toHaveLength(2);
  });

  it('C12 — over-budget documents are dropped whole, from the tail of the order, never truncated', async () => {
    // A tiny fallback window (model unknown → 30000 tokens → 7500-token budget
    // at 25%) so two ~4000-token docs cannot both fit.
    const bigText = (label: string) => `# ${label}\n\n${'word '.repeat(4200)}`; // ~4.2k tokens
    const rows: AttachmentRow[] = [
      { path: 'docs/one.md', targetKind: 'agent', targetId: 'agent-1', order: 0 },
      { path: 'docs/two.md', targetKind: 'agent', targetId: 'agent-1', order: 1 },
    ];
    const assembler = makeAssembler(rows, {
      'docs/one.md': bigText('one'),
      'docs/two.md': bigText('two'),
    });

    const result = await assembler.assemble(ref, repoId, [{ kind: 'agent', id: 'agent-1' }], 'unknown-model-xyz');

    expect(result.blocks.map((b) => b.source)).toEqual(['docs/one.md']);
    const dropped = result.used.find((u) => u.path === 'docs/two.md');
    expect(dropped).toMatchObject({ status: 'dropped' });
    expect(result.notes.some((n) => n.includes('dropped from the end of the order'))).toBe(true);
    // Never truncated mid-document: the kept block's text is the whole file.
    expect(result.blocks[0]!.text).toBe(bigText('one'));
  });

  it('C14 — a globally disabled skill contributes no documents', async () => {
    const rows: AttachmentRow[] = [
      { path: 'docs/agent-only.md', targetKind: 'agent', targetId: 'agent-1', order: 0 },
      { path: 'docs/skill-doc.md', targetKind: 'skill', targetId: 'skill-1', order: 0 },
    ];
    const assembler = makeAssembler(rows, {
      'docs/agent-only.md': 'agent doc',
      'docs/skill-doc.md': 'skill doc — must not appear',
    });

    const result = await assembler.assemble(
      ref,
      repoId,
      [
        { kind: 'agent', id: 'agent-1' },
        { kind: 'skill', id: 'skill-1', name: 'disabled-skill', enabled: false },
      ],
      'claude-sonnet-5',
    );

    expect(result.blocks.map((b) => b.source)).toEqual(['docs/agent-only.md']);
    expect(result.notes.some((n) => n.includes('globally disabled'))).toBe(true);
  });

  it('an agent with no attachments produces no blocks and no notes claiming a document', async () => {
    const assembler = makeAssembler([], {});
    const result = await assembler.assemble(ref, repoId, [{ kind: 'agent', id: 'agent-1' }], 'claude-sonnet-5');
    expect(result.blocks).toEqual([]);
    expect(result.used).toEqual([]);
  });

  it('an unreadable attached document is skipped, never fails assembly (R10, C7)', async () => {
    const rows: AttachmentRow[] = [{ path: 'docs/gone.md', targetKind: 'agent', targetId: 'agent-1', order: 0 }];
    // MockGitClient never throws (degrades unknown paths to ''); simulate the
    // real ENOENT path SimpleGitClient would hit with a throwing stub.
    const throwingGit = {
      readFile: async () => {
        throw new Error('ENOENT');
      },
    };
    const assembler = new ProjectContextAssembler(
      new FakeAttachmentSource(rows),
      throwingGit as unknown as ConstructorParameters<typeof ProjectContextAssembler>[1],
      new TiktokenTokenizer(),
      resolveContextWindow,
    );
    const result = await assembler.assemble(ref, repoId, [{ kind: 'agent', id: 'agent-1' }], 'claude-sonnet-5');
    expect(result.blocks).toEqual([]);
    expect(result.used[0]).toMatchObject({ path: 'docs/gone.md', status: 'skipped', tokens: 0 });
    expect(result.notes.some((n) => n.includes('unreadable'))).toBe(true);
  });
});

describe('resolveContextWindow (R7 fallback chain)', () => {
  it('falls back to the flat 30000 when the model is in neither source', () => {
    expect(resolveContextWindow('totally-unknown-model', null)).toBe(FALLBACK_CONTEXT_WINDOW);
    expect(resolveContextWindow('totally-unknown-model', undefined)).toBe(FALLBACK_CONTEXT_WINDOW);
  });

  it('prefers the provider-reported context length when populated', () => {
    expect(resolveContextWindow('claude-sonnet-5', 123456)).toBe(123456);
  });

  it('falls back to the static table when the provider has not populated contextLength', () => {
    const window = resolveContextWindow('claude-sonnet-5', null);
    expect(window).toBeGreaterThan(0);
    expect(window).not.toBe(FALLBACK_CONTEXT_WINDOW);
  });
});
