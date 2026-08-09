import { describe, it, expect } from 'vitest';
import { assembleSkillBlocks, isBodyChange } from '../src/modules/skills/helpers.js';

/**
 * Pure rules of the skills module. Both are decisions that are invisible in the
 * happy path and expensive to get wrong: a spurious version bump makes replay
 * pinning meaningless, and dropping from the wrong end of the assembly silently
 * discards the agent's highest-priority rules.
 */

describe('isBodyChange', () => {
  const existing = { body: 'prefer named exports' };

  it('is true when the patch sets a different body', () => {
    expect(isBodyChange(existing, { body: 'prefer default exports' })).toBe(true);
  });

  it('is false for a name/description/enabled-only edit', () => {
    // The patch type carries no body at all — this is the rename case.
    expect(isBodyChange(existing, {})).toBe(false);
  });

  it('is false when the body is re-sent unchanged', () => {
    // The editor PUTs the whole form, so an untouched body arrives on every
    // save. Treating that as a change would append an identical snapshot.
    expect(isBodyChange(existing, { body: 'prefer named exports' })).toBe(false);
  });
});

describe('assembleSkillBlocks', () => {
  it('keeps every body when they all fit', () => {
    const bodies = ['aaa', 'bbb', 'ccc'];
    expect(assembleSkillBlocks(bodies, 100)).toEqual({ blocks: bodies, droppedCount: 0 });
  });

  it('drops from the tail, not the head', () => {
    const bodies = ['a'.repeat(10), 'b'.repeat(10), 'c'.repeat(10)];
    const { blocks, droppedCount } = assembleSkillBlocks(bodies, 20);

    expect(blocks).toEqual([bodies[0], bodies[1]]);
    expect(droppedCount).toBe(1);
    // Stated separately so a head-dropping implementation cannot pass by
    // returning two blocks of the right total length.
    expect(blocks[0]).toBe(bodies[0]);
  });

  it('never splits a body mid-way', () => {
    const bodies = ['a'.repeat(10), 'b'.repeat(10)];
    // 15 leaves room for a partial second body — it must be dropped whole.
    const { blocks, droppedCount } = assembleSkillBlocks(bodies, 15);

    expect(blocks).toEqual([bodies[0]]);
    expect(droppedCount).toBe(1);
    expect(blocks.join('')).toHaveLength(10);
  });

  it('stops at the first body that does not fit rather than skipping ahead', () => {
    // A greedy "take whatever fits" pass would return ['aaa…', 'cc'] and
    // silently reorder the block. Order is the agent's stated priority.
    const bodies = ['a'.repeat(10), 'b'.repeat(10), 'cc'];
    const { blocks, droppedCount } = assembleSkillBlocks(bodies, 12);

    expect(blocks).toEqual([bodies[0]]);
    expect(droppedCount).toBe(2);
  });

  it('drops everything when even the first body is over budget', () => {
    expect(assembleSkillBlocks(['a'.repeat(50)], 10)).toEqual({ blocks: [], droppedCount: 1 });
  });
});
