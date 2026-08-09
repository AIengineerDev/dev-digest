import { describe, it, expect } from 'vitest';
import {
  buildConventionsSkillBody,
  evidenceFilesOf,
  findEvidenceLine,
  joinSamples,
  normalizeCodeLine,
  renderNumberedFile,
} from '../src/modules/conventions/helpers.js';

/**
 * The evidence gate, hermetically.
 *
 * This is the half of the feature that decides whether a candidate is a claim or
 * a guess, and none of it needs a database, a clone or a model — so it is tested
 * here rather than being implied by an integration happy path.
 */

const FILE = [
  'import { z } from "zod";',
  '',
  'export async function handler(req: Request) {',
  '  const parsed = Schema.safeParse(req.body);',
  '  if (!parsed.success) throw new ValidationError("bad input");',
  '  return ok(parsed.data);',
  '}',
].join('\n');

describe('findEvidenceLine', () => {
  it('accepts a verbatim quote and reports the line it is on', () => {
    const check = findEvidenceLine(FILE, '  if (!parsed.success) throw new ValidationError("bad input");', 5);
    expect(check).toEqual({ ok: true, line: 5 });
  });

  it('corrects a line number the model got wrong rather than dropping the rule', () => {
    // Same quote, claimed at line 42. The snippet is the claim; the number is a
    // pointer, and models routinely miscount.
    const check = findEvidenceLine(FILE, 'return ok(parsed.data);', 42);
    expect(check.ok).toBe(true);
    expect(check.line).toBe(6);
  });

  it('accepts a re-indented quote — models reflow what they copy', () => {
    const check = findEvidenceLine(FILE, '        const   parsed = Schema.safeParse(req.body);', 4);
    expect(check).toEqual({ ok: true, line: 4 });
  });

  it('rejects a snippet that is nowhere in the file', () => {
    const check = findEvidenceLine(FILE, 'const parsed = Schema.parse(req.body); // no safeParse', 4);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('not-found');
  });

  it('rejects an empty snippet instead of matching every blank line', () => {
    const check = findEvidenceLine(FILE, '   \n  ', 2);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('empty-snippet');
  });

  it('picks the occurrence nearest the claimed line when a quote repeats', () => {
    const repeated = ['a();', 'x();', 'a();', 'y();', 'a();'].join('\n');
    expect(findEvidenceLine(repeated, 'a();', 5).line).toBe(5);
    expect(findEvidenceLine(repeated, 'a();', 1).line).toBe(1);
  });

  it('is not fooled by a different identifier with the same shape', () => {
    // Whitespace is normalised; names are not. This is the line between
    // "re-indented" and "not the same code".
    expect(findEvidenceLine(FILE, 'return ok(parsed.body);', 6).ok).toBe(false);
  });
});

describe('normalizeCodeLine', () => {
  it('collapses whitespace and trims, and changes nothing else', () => {
    expect(normalizeCodeLine('\t const  a =\t1 ; ')).toBe('const a = 1 ;');
  });
});

describe('renderNumberedFile', () => {
  it('prefixes 1-based line numbers so the model can cite one', () => {
    const out = renderNumberedFile('src/a.ts', 'one\ntwo', 100);
    expect(out).toBe('--- src/a.ts ---\n1\tone\n2\ttwo');
  });

  it('says when it truncated, so the model does not read the cut as the end', () => {
    const out = renderNumberedFile('src/a.ts', 'x'.repeat(50), 10);
    expect(out).toContain('file truncated for sampling');
    expect(out).not.toContain('x'.repeat(11));
  });
});

describe('joinSamples', () => {
  it('drops whole files at the budget, never half of one', () => {
    const out = joinSamples(['aaaa', 'bbbb', 'cccc'], 10);
    expect(out).toBe('aaaa\n\nbbbb');
  });
});

describe('buildConventionsSkillBody', () => {
  const conventions = [
    {
      category: 'error-handling',
      rule: 'Route handlers throw ValidationError, never return a bare 400.',
      rationale: 'One error taxonomy means one place translates to status codes.',
      evidence_path: 'src/api/handler.ts',
      evidence_line: 5,
      evidence_snippet: 'if (!parsed.success) throw new ValidationError("bad input");',
    },
  ];

  it('keeps each rule attached to the code it came from', () => {
    const body = buildConventionsSkillBody('acme/payments-api', conventions);
    expect(body).toContain('acme/payments-api');
    expect(body).toContain(conventions[0]!.rule);
    expect(body).toContain('src/api/handler.ts:5');
    expect(body).toContain('throw new ValidationError("bad input");');
  });

  it('tells the agent not to invent rules the skill does not state', () => {
    const body = buildConventionsSkillBody('acme/payments-api', conventions);
    expect(body).toContain('not covered here is not a finding');
  });

  it('collects the distinct evidence files, in first-seen order', () => {
    const files = evidenceFilesOf([
      ...conventions,
      { ...conventions[0]!, evidence_path: 'src/b.ts' },
      { ...conventions[0]!, evidence_path: 'src/api/handler.ts' },
    ]);
    expect(files).toEqual(['src/api/handler.ts', 'src/b.ts']);
  });
});
