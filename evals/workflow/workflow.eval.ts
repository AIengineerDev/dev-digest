/**
 * `pnpm eval:workflow` — the only level that runs against the LIVE repository
 * with project settings loaded, because routing is a property of the harness
 * and cannot be measured in isolation.
 *
 * Read-only allow-list, deliberately: these sessions read the working tree.
 * `Bash` and `Write` are not on it and must not be added for convenience — a
 * case that needs to run a command is a case that belongs somewhere else.
 *
 * The control side is not an arm here but a CASE (`context-control`): the pair
 * that matters differs in whether project context is loaded at all, and that is
 * per-session, not per-suite.
 */
import type { EvalSuite } from '../src/case.js';
import { cases, NO_ESCAPE, READ_ONLY } from './workflow.cases.js';

const suite: EvalSuite = {
  name: 'harness-routing',
  kind: 'workflow',
  target: 'CLAUDE.md + .claude/agents + .claude/skills',
  // Routing is the hardest thing to measure cheaply: a weak model narrates a
  // dispatch instead of making one, and the case then fails for the wrong
  // reason. This is the one level worth a strong model.
  model: 'claude-sonnet-5',
  maxTurns: 20,
  arms: [
    {
      name: 'harness',
      settingSources: ['project'],
      allowedTools: READ_ONLY,
      disallowedTools: NO_ESCAPE,
    },
  ],
  cases,
};

export default suite;
