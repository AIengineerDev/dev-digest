/**
 * `pnpm eval:agents --suite architecture-reviewer`
 *
 * Two versions of the SAME agent, one variable between them. `v2-no-rule-citation`
 * is derived from the live definition at run time by deleting the two places
 * that demand a named rule — the `Rule or principle` column and question 1 of
 * the pre-flight checklist.
 *
 * The derivation ASSERTS its anchors. If the agent definition is reworded and
 * an anchor stops matching, this throws instead of quietly comparing two
 * identical arms and reporting "no delta" — which is the failure mode that
 * makes a version comparison worthless without anyone noticing.
 *
 * Expected shape of the result: `cites-a-rule` drops in v2 and NOTHING ELSE
 * moves. A version comparison that shows a diffuse score change is telling you
 * about the model's variance, not about the edit.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EvalSuite } from '../../src/case.js';
import { cases } from './architecture-reviewer.cases.js';

const here = dirname(fileURLToPath(import.meta.url));
const AGENT = resolve(here, '..', '..', '..', '.claude', 'agents', 'architecture-reviewer.md');

/** Strip the frontmatter — the body is what the harness turns into a prompt. */
function body(): string {
  return readFileSync(AGENT, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
}

const RULE_COLUMN = '| # | Finding | `<path>:<line>` | Rule or principle | Machine-checkable? | Severity | Smallest fix |';
const RULE_QUESTION_START = '1. **Which written rule does it break?**';
const RULE_QUESTION_END = '2. **Would `pnpm arch` catch it?**';

function withoutRuleCitation(): string {
  const text = body();
  if (!text.includes(RULE_COLUMN)) throw new Error('anchor gone: the findings table header changed');
  if (!text.includes(RULE_QUESTION_START)) throw new Error('anchor gone: checklist question 1 changed');
  const start = text.indexOf(RULE_QUESTION_START);
  const end = text.indexOf(RULE_QUESTION_END);
  if (end < start) throw new Error('anchor gone: checklist question 2 moved');
  return (
    text.slice(0, start) +
    text.slice(end)
  ).replace(
    RULE_COLUMN,
    '| # | Finding | `<path>:<line>` | Machine-checkable? | Severity | Smallest fix |',
  );
}

/** `allowedTools` does not block; `disallowedTools` does. Both, always. */
const READ_ONLY = ['Read', 'Grep', 'Glob'];
const NO_ESCAPE = ['Bash', 'Write', 'Edit', 'NotebookEdit', 'Task', 'Agent', 'WebFetch', 'WebSearch'];

const suite: EvalSuite = {
  name: 'architecture-reviewer',
  kind: 'agent',
  target: 'architecture-reviewer',
  model: 'claude-sonnet-5',
  maxTurns: 24,
  arms: [
    { name: 'v1-live', append: body, settingSources: [], allowedTools: READ_ONLY, disallowedTools: NO_ESCAPE },
    {
      // Marked control because it is SUPPOSED to lose `cites-a-rule`. Without
      // that flag a deliberate degradation reads as a red build.
      name: 'v2-no-rule-citation',
      control: true,
      append: withoutRuleCitation,
      settingSources: [],
      allowedTools: READ_ONLY,
      disallowedTools: NO_ESCAPE,
    },
  ],
  cases,
};

export default suite;
