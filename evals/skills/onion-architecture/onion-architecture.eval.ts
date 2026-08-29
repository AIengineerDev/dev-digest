/**
 * `pnpm eval:skills --suite onion-architecture`
 *
 * An ISOLATED content check: `settingSources: []`, so no CLAUDE.md, no project
 * skills, no project agents reach the session. The only difference between the
 * two arms is whether the SKILL.md body is appended to the system prompt, which
 * is exactly what linking or unlinking the skill changes.
 *
 * The session may read the fixture and nothing else — no Bash, no Write. A
 * review case has no business running commands, and a fixture is untrusted data.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EvalSuite } from '../../src/case.js';
import { cases } from './onion-architecture.cases.js';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(here, '..', '..', '..', '.claude', 'skills', 'onion-architecture', 'SKILL.md');

/** The live skill body, read at run time — a copy would drift and lie. */
const skillBody = (): string =>
  `You have been given a project skill. Follow it.\n\n${readFileSync(SKILL, 'utf8')}`;

/**
 * `allowedTools` alone does NOT constrain a session — measured: a run listing
 * only Read/Grep/Glob still reached for `Bash` and `Agent`, burned all 24 turns
 * shelling around the fixture, and ended in `error_max_turns` with nothing
 * graded. `disallowedTools` is the half that actually blocks, so both are set.
 */
const READ_ONLY = ['Read', 'Grep', 'Glob'];
const NO_ESCAPE = ['Bash', 'Write', 'Edit', 'NotebookEdit', 'Task', 'Agent', 'WebFetch', 'WebSearch'];

const suite: EvalSuite = {
  name: 'onion-architecture',
  kind: 'skill',
  target: 'onion-architecture',
  model: 'claude-sonnet-5',
  maxTurns: 24,
  arms: [
    // The control measures what the base model finds on its own. Its misses are
    // the result; they never fail the run.
    { name: 'without-skill', control: true, settingSources: [], allowedTools: READ_ONLY, disallowedTools: NO_ESCAPE },
    { name: 'with-skill', append: skillBody, settingSources: [], allowedTools: READ_ONLY, disallowedTools: NO_ESCAPE },
  ],
  cases,
};

export default suite;
