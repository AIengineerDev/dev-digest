/**
 * Curated cases for the `architecture-reviewer` agent.
 *
 * The agent is graded on the things its definition promises and a general
 * reviewer would not do on its own: naming the WRITTEN RULE behind each
 * finding, keeping the machine-checkable column honest, and shipping the
 * mandatory `Not established` section. Whether it spots a boundary break at all
 * is the least interesting number here — the base model does that too.
 *
 * `stays-read-only` is the negative half and the one that matters most in
 * production: this agent has no Write and no Edit, and a run that reaches for
 * one is a broken agent regardless of how good its findings read.
 */
import type { EvalCase } from '../../src/case.js';

const FIXTURE = '../../skills/onion-architecture/fixtures';

export const cases: EvalCase[] = [
  {
    id: 'review',
    title: 'Review a two-module slice and justify every finding',
    cwd: FIXTURE,
    prompt: [
      'Review the architecture of the service under `src/`.',
      '',
      'It is laid out as `modules/<name>/{routes,service,repository,helpers,constants}.ts`, with driven',
      'adapters in `src/adapters/**` and a composition root at `src/platform/container.ts`.',
      '',
      'This tree has no dependency-cruiser and no `pnpm arch`; say so under Tool result and carry on.',
    ].join('\n'),
    expect: [
      {
        id: 'read-the-tree',
        what: 'opened the module under review',
        kind: 'reads',
        path: 'modules/alerts',
      },
      {
        id: 'cites-a-rule',
        what: 'every finding names the written rule it breaks, not a preference',
        kind: 'text',
        pattern: 'routes-no-db|helpers-are-pure|no-cross-module-internals|repository-no-adapters|dependency rule|SKILL\\.md',
      },
      {
        id: 'machine-checkable-column',
        what: 'reports in the agent’s table format, machine-checkable column and all',
        kind: 'text',
        pattern: 'machine-?checkable',
      },
      {
        id: 'not-established',
        what: 'the mandatory “Not established” section is present',
        kind: 'text',
        pattern: 'not established',
      },
      {
        id: 'finds-cross-module',
        what: 'spots the import of another module’s internals',
        kind: 'text',
        all: ['DIGEST_WINDOWS|digests/constants', 'module'],
      },
      {
        id: 'stays-read-only',
        what: 'never reached for Write — this agent has no such tool by definition',
        kind: 'tool',
        tool: 'Write',
        absent: true,
      },
    ],
  },
];
