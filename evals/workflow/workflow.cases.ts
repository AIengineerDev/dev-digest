/**
 * Workflow cases: the harness itself under test, not one artefact inside it.
 *
 * These run against the REAL repository with project settings loaded, so what
 * is being measured is routing — does a task reach the right subagent, does a
 * skill wake when it should and stay asleep when it should not, does CLAUDE.md
 * actually send a session to the document it names.
 *
 * Every expectation is evidence from the trajectory. Prose is not accepted for
 * any of them: "I'll have the architecture-reviewer look at this" is a sentence,
 * and a `Task(subagent_type: architecture-reviewer)` is a dispatch.
 */
import type { EvalCase } from '../src/case.js';

/**
 * A session reading the LIVE repository gets read-only tools and an explicit
 * block list. `allowedTools` on its own does not restrain anything — measured —
 * so the block list is what keeps a routing case from editing the working tree.
 * `Task` and `Skill` stay: they are the evidence these cases are looking for.
 */
const READ_ONLY = ['Read', 'Grep', 'Glob', 'Task', 'Skill'];
const NO_ESCAPE = ['Bash', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch'];

export const cases: EvalCase[] = [
  {
    id: 'dispatch',
    title: 'An architecture question reaches the architecture-reviewer',
    prompt: [
      'Someone landed a change under `server/src/modules/repo-intel/` that adds a new repository file',
      'and imports the GitHub adapter from it.',
      '',
      'Review whether that respects our architectural boundaries. Use whichever specialist agent is right',
      'for this; do not do the review yourself.',
    ].join('\n'),
    expect: [
      {
        id: 'dispatched-reviewer',
        what: 'dispatched the architecture-reviewer subagent',
        kind: 'agent',
        agent: 'architecture-reviewer',
      },
      {
        id: 'no-wrong-agent',
        what: 'did not send an architecture question to the test-writer',
        kind: 'agent',
        agent: 'test-writer',
        absent: true,
      },
    ],
  },
  {
    id: 'activation-positive',
    title: 'A finished, non-obvious debugging result wakes engineering-insights',
    prompt: [
      'We finally found why the reviewer runs were stuck in `running` after a deploy: the boot reaper only',
      'reaps runs older than the process start time, and a container restarted mid-run leaves rows the reaper',
      'skips forever. We fixed it in the server module.',
      '',
      'Record what we learned from this so the next person does not re-derive it.',
    ].join('\n'),
    expect: [
      {
        id: 'insights-activated',
        what: 'the engineering-insights skill activated on a "what did we learn" prompt',
        kind: 'skill',
        skill: 'engineering-insights',
      },
    ],
  },
  {
    id: 'activation-negative',
    title: 'A plain factual question does NOT wake engineering-insights',
    prompt: 'Which port does the API listen on when I run the dev script?',
    expect: [
      {
        id: 'insights-quiet',
        what: 'a lookup question did not activate the insights skill',
        kind: 'skill',
        skill: 'engineering-insights',
        absent: true,
      },
      {
        id: 'answered-from-the-repo',
        what: 'still answered from the repository rather than from memory',
        kind: 'text',
        pattern: '3001',
      },
    ],
  },
  {
    id: 'context-treatment',
    title: 'CLAUDE.md routes a new-API-route question to server/README.md',
    prompt: [
      'I am about to add a new API route to the server.',
      'What must I read first, and where does the route file go? Read what you need before answering.',
    ].join('\n'),
    expect: [
      {
        id: 'read-server-readme',
        what: 'followed CLAUDE.md’s “Read server/README.md when adding an API route”',
        kind: 'reads',
        path: 'server/README\\.md',
      },
      {
        id: 'names-the-route-path',
        what: 'answers with this repo’s actual convention, not a generic Fastify answer',
        kind: 'text',
        pattern: 'modules/.*routes\\.ts|routes\\.ts',
      },
    ],
  },
  {
    id: 'context-control',
    title: 'The same question with no project context reaches nothing',
    cwd: './fixtures/no-context',
    // The control differs from the treatment in ONE thing: no settings are
    // loaded, so there is no CLAUDE.md to route on.
    override: { settingSources: [], allowedTools: READ_ONLY, disallowedTools: NO_ESCAPE },
    prompt: [
      'I am about to add a new API route to the server.',
      'What must I read first, and where does the route file go? Read what you need before answering.',
    ].join('\n'),
    expect: [
      {
        id: 'read-server-readme',
        what: 'without project context there is no server/README.md to find',
        kind: 'reads',
        path: 'server/README\\.md',
        absent: true,
      },
    ],
  },
];

export { READ_ONLY, NO_ESCAPE };
