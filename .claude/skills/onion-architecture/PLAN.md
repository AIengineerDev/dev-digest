# `onion-architecture` — the plan the skill was built from

Status: **historical.** This was the design document written before the skill
existed; the skill has since shipped and is the authority. Kept because it
records the measurements and the reasoning, which `SKILL.md` deliberately does
not repeat. Sources: [`README.md`](README.md) in this folder.

---

## 1. What the measurement showed: the onion is already here

Before designing the skill I measured the backend source tree. The conclusion was
stronger than expected: **the backend is already built as an onion — it is simply
written down nowhere and nothing holds it in place.**

What was already right:

| Fact | Where it shows |
| --- | --- |
| **Ports sit in the centre, not in infrastructure** | `AuthProvider`, `SecretsProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `LLMProvider` — interfaces in the shared contracts package, not in `adapters/` |
| **Adapters implement ports at the edge** | `src/adapters/{github,git,llm,embedder,codeindex,secrets,auth}/` |
| **There is a composition root** | `src/platform/container.ts` — the one place where a concrete class meets an interface |
| **Services depend on interfaces** | no `service.ts` or `repository.ts` imports `fastify` |
| **Tests substitute the edge, not the internals** | `src/adapters/mocks.ts` + `ContainerOverrides` |

So the skill **does not introduce a new architecture**. It names the existing one,
gives it rules and — most importantly — turns on enforcement. That matters: a
skill demanding a rewrite of the whole backend is a skill nobody will follow.

## 2. The deviations that were measured

| Deviation | Scale | Why it breaks the onion |
| --- | --- | --- |
| Modules with no service layer: `routes.ts` imports `db/schema` directly | **4 of 8**: `polling`, `pulls`, `settings`, `workspace` | The outermost layer (HTTP) reaches into the innermost (persistence), bypassing the domain |
| Asymmetric layers | 8 × `routes.ts`, but 4 × `service.ts` and 4 × `repository.ts` | Half the modules are two-tier, half three-tier — there is no rule |
| Logic outside the layers | `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repos/helpers.ts` import `db` | A file whose role is "helper" holds data access |
| **`dependency-cruiser` installed but not configured** | no config, no script | The enforcement tool is already paid for and unused |

The last row is the most valuable. A rule that is not checked degrades within two
sprints, and the tool that would check it **is already installed**.

## 3. Layers: how the onion maps onto the existing folders

No new names where names already exist. The mapping:

```
        ┌─────────────────────────────────────────┐
        │  routes.ts        HTTP adapter (driving)│  ← Zod schemas, status codes
        │  ┌───────────────────────────────────┐  │
        │  │  service.ts     Application       │  │  ← use cases, orchestration, transactions
        │  │  ┌─────────────────────────────┐  │  │
        │  │  │  helpers.ts + constants.ts  │  │  │  ← Domain: pure rules
        │  │  │  shared contracts package   │  │  │  ← Domain: types + PORTS
        │  │  └─────────────────────────────┘  │  │
        │  └───────────────────────────────────┘  │
        │  repository.ts    persistence adapter   │  ← Drizzle, SQL, table rows
        │  adapters/**      driven adapters       │  ← GitHub, git, LLM, secrets
        └─────────────────────────────────────────┘
                platform/container.ts — the composition root
```

The thing the skill has to drive home: **`repository.ts` is an edge, not a
bottom.** In classic layering the database sits at the bottom and everything
depends on it; in the onion it is an external adapter exactly like a third-party
API. This is where the onion differs from "three layers", and it is the part most
often misunderstood.

## 4. The dependency rule — the one sentence the skill enforces

> Imports point inward only. `routes` → `service` → `repository`/adapters.
> Never the other way, never skipping a layer.

The checkable prohibitions follow from it:

1. `routes.ts` **does not import** `db/**` — only `service`.
2. `service.ts` **does not import** `fastify` and knows nothing about HTTP codes.
3. `repository.ts` **does not import** a sibling's `service.ts` and does not call adapters.
4. `helpers.ts` is pure: no `db`, no adapters, no I/O.
5. A module **does not import** another module's internal files — only its public entry point.
6. Concrete adapter classes are instantiated **only** in `platform/container.ts`.
7. A port (interface) lives in the shared contracts package, the implementation in `adapters/`. Not the reverse.

## 5. The shape of the skill

`SKILL.md`, in English, roughly 180–200 lines, `version: 1.0.0` — the same shape
as `frontend-ui-architecture`, so the two read alike.

| § | Content | Why |
| --- | --- | --- |
| 1 | **The dependency rule** in one paragraph plus a layer diagram | The one thing to remember |
| 2 | **A "what I am adding → which file" table** | The working part; the analogue of the placement table in the frontend skill |
| 3 | **What belongs to each layer** — and, in its own column, what is forbidden to it | Agents follow prohibitions better than permissions |
| 4 | **Ports and adapters**: when a new dependency becomes a port and when it stays a detail of a service | The most frequent question on a new integration |
| 5 | **Transactions**: the service owns the boundary, the repository accepts `tx` | Otherwise the transaction leaks into the HTTP layer |
| 6 | **Errors**: the repository translates database errors into domain errors; HTTP codes only in `routes` | `platform/errors.ts` already exists — build on it |
| 7 | **When the onion is unnecessary** (see §7 below) | Without it the skill starts breeding empty layers |
| 8 | **Known deviations** — the 4 service-less modules, by name | Honesty; otherwise an agent treats them as the model |
| 9 | **A closing checklist** — 6–7 items | The part that actually gets followed |

Also in the folder: `README.md` (sources) and the dependency-cruiser config from §6.

## 6. Enforcement, not aspiration

The most important part of the plan. The skill states the rules; the config holds
them.

Create `.dependency-cruiser.cjs` with `forbidden` rules matching §4 and add an
`arch` script (and put it in CI next to `typecheck`). Sketch:

```js
forbidden: [
  { name: 'routes-no-db', severity: 'error',
    from: { path: 'src/modules/[^/]+/routes\\.ts$' },
    to:   { path: 'src/db/' } },
  { name: 'service-no-http', severity: 'error',
    from: { path: 'src/modules/[^/]+/service\\.ts$' },
    to:   { dependencyTypes: ['npm'], path: '^fastify' } },
  { name: 'helpers-are-pure', severity: 'error',
    from: { path: 'src/modules/.*/helpers\\.ts$' },
    to:   { path: '^src/(db|adapters)/' } },
  { name: 'no-cross-module-internals', severity: 'error',
    from: { path: 'src/modules/([^/]+)/' },
    to:   { path: 'src/modules/(?!$1)[^/]+/(?!index)' } },
  { name: 'adapters-instantiated-only-in-container', severity: 'warn',
    from: { pathNot: 'src/platform/container\\.ts$' },
    to:   { path: '^src/adapters/(?!index)' } },
]
```

**The order of operations matters.** Run the config against the current code
first and see the real violation count. If there are many, some rules start at
`severity: 'warn'`, otherwise the gate is red from day one and someone turns it
off. The numbers go in after measuring, not before.

## 7. Protection against overengineering — a required section

The most common way the onion fails is empty layers: a service that delegates to
a repository in one line. The criticism
([Rentea](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/),
[Three Dots Labs](https://threedots.tech/episode/is-clean-architecture-overengineering/))
agrees on one point: the onion pays for domain complexity, not for folder count.

The skill must explicitly permit a CRUD module to stay two-tier
(`routes` + `repository`) for as long as it holds no rules. The proposed
criterion, which an agent can check:

> A service appears when an operation does **more than one** of:
> touching a second repository · calling an adapter · applying a rule that is not
> shape validation · managing a transaction.
> Otherwise `routes` → `repository` is a finished architecture, not debt.

This also justifies the four existing two-tier modules rather than recording them
as debt — but only after checking each one against the criterion (§9).

## 8. What the skill does not do

The scope stays narrow, or it will conflict with files that already exist:

- No DDD aggregates, value objects or rich domain model. The data here is Drizzle
  rows and Zod types; the anemic model is a deliberate choice.
- It does not rewrite the shared contracts package. Contracts change under the
  existing rule (contract first, then consumers).
- It does not touch the pure engine package — that is already I/O-free.
- It does not duplicate the backend's own agent guide (commands, route schemas,
  migrations) and does not duplicate `engineering-insights`.

## 9. To do before writing — and the questions that need a decision

Mechanical, done first:

1. Run the draft dependency-cruiser config and get the real violation count.
2. Check each of the 4 two-tier modules against the §7 criterion: debt or normal.
3. Confirm whether `platform/errors.ts` already provides the domain error types §6 needs.

Questions where the answer changes what the skill says:

- **Do we force a service layer in every module?** Default: no, use the §7
  criterion. Wanting uniformity means refactoring 4 modules, as a separate task.
- **Does the architecture gate enter CI as `error` immediately, or as `warn` for
  a month?** Default: new rules `error`, historical violations `warn` until
  cleared.
- **Do we split ports out of the shared contracts package into their own
  `ports.ts`?** They are currently mixed in with DTO contracts. Default: leave
  them, but record in the skill that the package holds two different things.
