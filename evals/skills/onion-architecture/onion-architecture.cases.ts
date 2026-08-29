/**
 * Curated cases for the `onion-architecture` skill.
 *
 * Every plant is a violation of a rule the SKILL.md states, and the fixture
 * says nothing about any of them — a fixture that explains its own plants makes
 * both arms score alike and the eval measures nothing.
 *
 * Two expectations here are deliberately hard, and they are the ones worth
 * watching: `adapter-not-in-container` (a service constructing an adapter
 * instead of receiving it) and `empty-service` (a service that forwards one
 * call and earns no layer) are rules, not smells — a model without the skill
 * usually calls the second one "clean separation of concerns" and praises it.
 *
 * `not-a-finding` is the negative half: `digests/routes.ts` calling its service
 * is CORRECT, and an arm that flags it is noisier, not sharper.
 */
import type { EvalCase } from '../../src/case.js';

export const cases: EvalCase[] = [
  {
    id: 'layering',
    title: 'Two modules, six boundary breaks, nothing labelled',
    cwd: './fixtures',
    prompt: [
      'Review the architecture of the TypeScript service under `src/`.',
      '',
      'It is a Fastify + Drizzle backend laid out as `modules/<name>/{routes,service,repository,helpers,constants}.ts`,',
      'with driven adapters in `src/adapters/**` and a composition root at `src/platform/container.ts`.',
      '',
      'Read every file under `src/` and report each place where the layering is wrong.',
      'For each one give the file path and the mechanism — what imports what, and why that direction is not allowed.',
      'Do not fix anything.',
    ].join('\n'),
    expect: [
      {
        id: 'read-the-tree',
        what: 'actually opened the fixture rather than answering from the prompt',
        kind: 'reads',
        path: 'modules/alerts',
      },
      {
        id: 'routes-db',
        what: 'alerts/routes.ts queries db/schema directly, skipping its service',
        kind: 'text',
        all: ['alerts/routes\\.ts|routes\\.ts', 'db/schema|schema\\.js|the database directly'],
      },
      {
        id: 'helpers-db',
        what: 'alerts/helpers.ts imports db/schema, so the pure layer is not pure',
        kind: 'text',
        all: ['helpers\\.ts', 'db/schema|schema\\.js'],
      },
      {
        id: 'cross-module',
        what: "alerts/service.ts imports digests' internal constants instead of shared",
        kind: 'text',
        all: ['DIGEST_WINDOWS|digests/constants', 'cross-module|another module|internal'],
      },
      {
        id: 'repo-adapter',
        what: 'alerts/repository.ts constructs the GitHub adapter — a repository reaching sideways',
        kind: 'text',
        all: ['repository\\.ts', 'GithubClient|adapters/github'],
      },
      {
        id: 'adapter-not-in-container',
        what: 'alerts/service.ts news up MailerClient from process.env instead of receiving it from the container',
        kind: 'text',
        all: ['MailerClient|mailer', 'container|inject|constructor'],
      },
      {
        id: 'empty-service',
        what: 'digests/service.ts forwards one call per method and earns no layer',
        kind: 'text',
        all: ['digests/service\\.ts|DigestsService', 'pass-?through|forward|adds nothing|no logic|empty'],
      },
      {
        id: 'not-a-finding',
        what: 'digests/routes.ts calling its own service is correct and must not be reported',
        kind: 'text',
        absent: true,
        all: ['digests/routes\\.ts', 'violat|should not|incorrect'],
      },
    ],
  },
  {
    id: 'new-port',
    title: 'Where a new external dependency goes — and what is NOT a port',
    cwd: './fixtures',
    /**
     * Measured 2026-08-29, `claude-sonnet-5`, one trial each: the first three
     * expectations passed 3/3 in BOTH arms. They are kept as regression pins,
     * not as evidence — the fixture ships a `container.ts` that demonstrates
     * the pattern, so a model that reads it answers correctly without the
     * skill. A "where does it go" question asked inside a tree that already
     * shows the answer measures the fixture, not the skill.
     *
     * `stateless-helper-is-not-a-port` is the discriminator. The skill states
     * that a stateless function with no credentials and no network stays an
     * ordinary module — `astgrep`, `tokenizer`, `git/diff-parser` are named as
     * deliberate non-ports. Nothing in the fixture shows that, and "wrap it in
     * an interface for testability" is the reflex answer without it.
     */
    prompt: [
      'Two things are being added to this service.',
      '',
      '1. Slack delivery: a client that posts a message to a Slack webhook, with a token, over the network.',
      '2. A unified-diff parser: a pure function, no credentials, no network, no state.',
      '',
      'For each one, say where it goes and which file wires it. Name the files.',
      'If one of them should NOT become a port, say so and say why.',
    ].join('\n'),
    expect: [
      {
        id: 'port-interface',
        what: 'the Slack interface belongs in the shared contracts package',
        kind: 'text',
        all: ['port|interface', 'shared'],
      },
      {
        id: 'adapter-impl',
        what: 'the implementation goes under src/adapters/<name>/',
        kind: 'text',
        pattern: 'adapters/slack|src/adapters',
      },
      {
        id: 'container-wires',
        what: 'the container is the only place concrete meets interface',
        kind: 'text',
        all: ['container\\.ts|composition root', 'wir|construct|only place'],
      },
      {
        id: 'stateless-helper-is-not-a-port',
        what: 'the pure parser stays an ordinary module — no port, imported directly',
        kind: 'text',
        all: [
          'parser|diff-parser',
          'not a port|no port|does not need a port|ordinary module|imported directly|directly imported',
        ],
      },
    ],
  },
];
