import { describe, it, expect } from 'vitest';
import {
  AgentVersionConfig,
  CreateSkillInput,
  SkillRef,
  SkillVersion,
  UpdateSkillInput,
} from '@devdigest/shared';

/**
 * The tolerant `AgentVersionConfig.skills` union is the whole migration story
 * for skill version pinning: existing `agent_versions` rows hold bare skill ids
 * and are deliberately never rewritten, so this is the only place where the old
 * data meets the new shape. If this file goes red, someone's existing workspace
 * fails to parse its agent history at runtime.
 */

const baseConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  system_prompt: 'review carefully',
  output_schema: null,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
};

describe('AgentVersionConfig.skills — tolerant union', () => {
  it('parses a legacy row of bare string ids and normalises to unpinned refs', () => {
    const parsed = AgentVersionConfig.parse({ ...baseConfig, skills: ['s1', 's2'] });

    expect(parsed.skills).toEqual([
      { id: 's1', version: null },
      { id: 's2', version: null },
    ]);
  });

  it('parses the new object form and keeps the pinned version', () => {
    const parsed = AgentVersionConfig.parse({
      ...baseConfig,
      skills: [
        { id: 's1', version: 3 },
        { id: 's2', version: 1 },
      ],
    });

    expect(parsed.skills).toEqual([
      { id: 's1', version: 3 },
      { id: 's2', version: 1 },
    ]);
  });

  it('parses a mixed row and preserves order', () => {
    const parsed = AgentVersionConfig.parse({
      ...baseConfig,
      skills: ['legacy', { id: 'pinned', version: 7 }, 'tail'],
    });

    expect(parsed.skills).toEqual([
      { id: 'legacy', version: null },
      { id: 'pinned', version: 7 },
      { id: 'tail', version: null },
    ]);
  });

  it('accepts an explicit null version on the object form', () => {
    const parsed = AgentVersionConfig.parse({
      ...baseConfig,
      skills: [{ id: 's1', version: null }],
    });

    expect(parsed.skills).toEqual([{ id: 's1', version: null }]);
  });

  it('rejects shapes that are neither an id nor a ref', () => {
    expect(() => AgentVersionConfig.parse({ ...baseConfig, skills: [{ id: 's1' }] })).toThrow();
    expect(() =>
      AgentVersionConfig.parse({ ...baseConfig, skills: [{ id: 's1', version: 1.5 }] }),
    ).toThrow();
    expect(() => AgentVersionConfig.parse({ ...baseConfig, skills: [42] })).toThrow();
  });
});

describe('SkillRef', () => {
  it('requires version to be present, allowing null but not undefined', () => {
    expect(SkillRef.parse({ id: 's1', version: null })).toEqual({ id: 's1', version: null });
    expect(() => SkillRef.parse({ id: 's1' })).toThrow();
  });
});

describe('skill write shapes', () => {
  it('defaults CreateSkillInput.enabled to true and requires the rest', () => {
    expect(
      CreateSkillInput.parse({
        name: 'hermetic-boundaries',
        description: 'where the DB is allowed',
        type: 'convention',
        body: '...',
      }).enabled,
    ).toBe(true);

    expect(() =>
      CreateSkillInput.parse({ name: '', description: '', type: 'convention', body: '' }),
    ).toThrow();
    expect(() =>
      CreateSkillInput.parse({ name: 'x', description: '', type: 'not-a-type', body: '' }),
    ).toThrow();
  });

  it('lets UpdateSkillInput patch a single field', () => {
    expect(UpdateSkillInput.parse({ name: 'renamed' })).toEqual({ name: 'renamed' });
    expect(UpdateSkillInput.parse({})).toEqual({});
    expect(() => UpdateSkillInput.parse({ enabled: 'yes' })).toThrow();
  });

  it('parses a SkillVersion snapshot', () => {
    const snapshot = {
      skill_id: 's1',
      version: 2,
      body: 'rule text',
      created_at: '2026-08-09T00:00:00.000Z',
    };
    expect(SkillVersion.parse(snapshot)).toEqual(snapshot);
    expect(() => SkillVersion.parse({ ...snapshot, version: 'two' })).toThrow();
  });
});
