/**
 * Architecture rules — the enforced half of the `onion-architecture` skill.
 *
 * Run with `pnpm arch`. Every rule here restates one sentence from the skill;
 * if you change a rule, change the skill in the same commit, or the two drift
 * and the written one loses.
 *
 * Historical violations are recorded in `.dependency-cruiser-known-violations.json`
 * and ignored via `--ignore-known`, so this is red only for *new* breakage.
 * Never regenerate that baseline to make a failure go away — fix the import, or
 * argue the rule down deliberately.
 */
module.exports = {
  forbidden: [
    {
      name: 'routes-no-db',
      comment:
        'HTTP is the outermost layer; persistence is the far edge. A route that ' +
        'reaches the database skips the domain entirely. Go through a service, ' +
        'or through the module repository if the module has no service yet.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^src/db/' },
    },
    {
      name: 'service-no-http',
      comment:
        'A service states what the application does, not how it is delivered. ' +
        'Status codes, replies and request objects belong in routes.ts.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/service\\.ts$' },
      to: { path: '^fastify' },
    },
    {
      name: 'helpers-are-pure',
      comment:
        'helpers.ts is domain: pure functions over values. The moment it needs ' +
        'the database or an adapter it is application logic — move it into the ' +
        'service, or behind a repository.',
      severity: 'error',
      from: { path: 'src/modules/.+/helpers\\.ts$' },
      to: { path: '^src/(db|adapters)/' },
    },
    {
      name: 'repository-no-adapters',
      comment:
        'A repository translates between our types and SQL. Nothing else. If a ' +
        'write needs GitHub or an LLM, the service orchestrates both.',
      severity: 'error',
      from: {
        path: 'src/modules/[^/]+/(repository\\.ts|repository/[^/]+\\.repo\\.ts)$',
      },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'injected-adapters-only-from-container',
      comment:
        'Port-backed adapters are constructed once, in the composition root, and ' +
        'reach code as an interface from @devdigest/shared. Importing the concrete ' +
        'class anywhere else re-couples the core to the edge and breaks mocks.ts. ' +
        'Stateless helpers under adapters/ (astgrep, tokenizer, diff-parser, ' +
        'codeindex/extract) are deliberately not covered — they are pure functions.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(platform/container\\.ts|adapters/)' },
      to: {
        path: '^src/adapters/(github|git/simple-git|llm|embedder|secrets|auth|codeindex/ripgrep)',
      },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        'One module may not reach into another module\'s files. Share through ' +
        '@devdigest/shared, through modules/_shared, or through the container.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/.+',
        pathNot: '^src/modules/($1)/|^src/modules/_shared/',
      },
    },
    {
      name: 'db-no-outward',
      comment:
        'The schema is a leaf. If it imports a module or an adapter, the ' +
        'dependency arrow has been reversed.',
      severity: 'error',
      from: { path: '^src/db/' },
      to: { path: '^src/(modules|adapters|platform)/' },
    },
    {
      name: 'no-circular',
      comment:
        'A cycle means the layer boundary is fictional. Most cycles here run ' +
        'through container.ts — break them by depending on the interface, not ' +
        'on the module that the container happens to construct.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    // vendor/ is vendored and follows none of this; clones/ is user repos.
    exclude: { path: '(^|/)(clones|vendor)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
