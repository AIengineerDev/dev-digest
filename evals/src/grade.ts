/**
 * Grading is deterministic and evidence-first. There is no LLM judge here on
 * purpose: a judge that reads the session's own summary can be talked into
 * agreeing with it, and the failure mode we care about most — an agent that
 * narrates a dispatch it never made — is exactly the one prose scoring misses.
 *
 * Text expectations exist, but they are the weakest kind, and a case built only
 * out of them is a case that any competent base model passes without the skill.
 */
import type { Expectation } from './case.js';
import type { Trajectory } from './session.js';

export interface Verdict {
  id: string;
  what: string;
  /** True when the expectation held — including a negative one whose evidence is absent. */
  pass: boolean;
  /** What was found (or, for a negative, what should not have been). */
  evidence: string | null;
}

function evidenceFor(exp: Expectation, t: Trajectory): string | null {
  switch (exp.kind) {
    case 'tool': {
      const input = exp.input ? new RegExp(exp.input, 'i') : null;
      const hit = t.tools.find(
        (c) => c.name === exp.tool && (!input || input.test(JSON.stringify(c.input))),
      );
      return hit ? `${hit.name}(${JSON.stringify(hit.input).slice(0, 160)})` : null;
    }
    case 'reads': {
      const re = new RegExp(exp.path, 'i');
      return t.reads.find((p) => re.test(p)) ?? null;
    }
    case 'agent': {
      const re = new RegExp(exp.agent, 'i');
      const hit = t.agents.find((a) => re.test(a));
      return hit ? hit.slice(0, 160) : null;
    }
    case 'skill': {
      const re = new RegExp(exp.skill, 'i');
      return t.skills.find((s) => re.test(s)) ?? null;
    }
    case 'text': {
      const patterns = exp.all ?? (exp.pattern ? [exp.pattern] : []);
      if (!patterns.length) throw new Error(`text expectation ${exp.id} has neither pattern nor all`);
      const hits = patterns.map((p) => new RegExp(p, 'i').exec(t.text));
      if (hits.some((h) => h === null)) return null;
      return hits.map((h) => h?.[0].slice(0, 60)).join(' … ');
    }
  }
}

export function grade(expected: Expectation[], t: Trajectory): Verdict[] {
  return expected.map((exp) => {
    const evidence = evidenceFor(exp, t);
    return {
      id: exp.id,
      what: exp.what,
      pass: exp.absent ? evidence === null : evidence !== null,
      evidence,
    };
  });
}
