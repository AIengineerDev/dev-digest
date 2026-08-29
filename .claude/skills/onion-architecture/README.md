# `onion-architecture` — sources

The material [`PLAN.md`](PLAN.md) was built from. Confidence levels are the same
as in `frontend-ui-architecture/README.md`: **P** — primary source or the author
of the concept, **S** — named expert opinion, **T** — survey content, useful only
as a signal.

Collected 2026-08-09.

---

## 1. The onion — primary sources

| Source | Level | What it gives |
| --- | --- | --- |
| [Jeffrey Palermo — The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | P | The article that introduced the term (2008). Its goal is to break the coupling to the database that classic layering creates. Parts 2, 3 and "part 4 — After Four Years" (2013) follow on the same blog. |
| [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) | S | The most precise treatment in the *Software Architecture Chronicles* series: how the onion differs from layered and from hexagonal, without the marketing. |
| [NDepend — Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/) | S | Puts the emphasis on the **direction** of dependencies as the only real substance — which is what §4 of the plan does. |
| [Allegro Tech — Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html) | S | A team's production experience, including what did not work. |
| [Dani Grudzynskyi — Unfolding infrastructure in the Onion architecture](https://dgrudzynskyi.github.io/dev-blog/architecture/2020/12/18/unfolding-infrastructure-in-onion-architecture.html) | S | The most useful one here: how to organise infrastructure once there are many adapters. |
| [DZone — Onion Architecture Is Interesting](https://dzone.com/articles/onion-architecture-is-interesting) | T | A survey retelling; used to check nothing was missed. |
| [Onion Architecture vs Clean Architecture](https://dev.to/godofgeeks/onion-architecture-vs-clean-architecture-584h) | T | Separates two terms that are frequently confused. |

## 2. Ports and adapters — where the onion gets its mechanics

| Source | Level | What it gives |
| --- | --- | --- |
| [Michael Scharhag — From layers to onions and hexagons](https://www.mscharhag.com/architecture/layer-onion-hexagonal-architecture) | S | The clearest text on moving from layers to the onion: **the database stops being the bottom and becomes an edge**. That is the thesis of §3 of the plan. |
| [Ports and Adapters — Software Architecture wiki](https://synchronium.github.io/software-architecture-wiki/styles/ports-and-adapters.html) | S | Driving (primary) vs driven (secondary) adapters — the vocabulary that was missing: routes are driving, `adapters/**` are driven. |
| [Hexagonal Architecture: a complete guide with a TypeScript example (2026)](https://generalistprogrammer.com/tutorials/hexagonal-architecture-complete-guide) | S | Port as a TypeScript interface, adapter as a class. Exactly the model used here: shared contracts plus `adapters/`. |
| [Chakray — Hexagonal Architecture: a complete guide](https://chakray.com/hexagonal-architecture-a-complete-guide-to-robust-and-testable-software-design/) | S | Emphasis on testability — the justification for `adapters/mocks.ts`. |
| [Ports and Adapters, Explained with Two Real Codebases](https://saadh393.github.io/blog/adapter-port-architecture-two-cases) | S | Two real codebases instead of a toy example. |
| [Alex Rusin — A Guide to Ports & Adapters](https://blog.alexrusin.com/future-proof-your-code-a-guide-to-ports-adapters-hexagonal-architecture/) | T | A practical introduction. |
| [Hexagonal vs Clean vs Onion: what survives in 2026](https://dev.to/dev_tips/hexagonal-vs-clean-vs-onion-which-one-actually-survives-your-app-in-2026-273f) | T | A three-way comparison; useful for keeping the terminology in the skill from blurring. |
| [hexagonal_example_nodejs](https://github.com/fraybabak/hexagonal_example_nodejs) · [onion-architecture-node-js](https://github.com/hadyjsc/onion-architecture-node-js) | T | Reference repositories on Node/TS. Look at the folder layout; do not copy the code. |

## 3. Fastify — as the HTTP layer and as DI

| Source | Level | What it gives |
| --- | --- | --- |
| [Fastify — Plugins (reference)](https://fastify.dev/docs/latest/Reference/Plugins/) | P | `register` creates a new scope; `decorate` does not leak upward. That is the module encapsulation mechanism behind the convention "one module = one plugin". |
| [Fastify — The hitchhiker's guide to plugins](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) | P | The official guide to building an application as a tree of plugins. |
| [fastify/help #284 — best practice for dependency injection](https://github.com/fastify/help/issues/284) | P | The maintainers' answer: the plugin system **is** the DI system; a separate container is not always needed. This is why the composition root here stays a plain object rather than a library. |
| [Snyk — Fastify plugins as building blocks for a backend Node.js API](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/) | S | The plugin as the unit of composition; each one can later become a service. |
| [Rafael Gonzaga — Fastify, why another framework?](https://blog.rafaelgss.dev/fastify-why-another-framework-js) | S | The encapsulation model, from someone on the core team. |
| [Strapi — production-ready APIs with Fastify](https://strapi.io/blog/build-production-ready-apis-with-fastify) | T | Application factory plus `fastify.inject()` for tests without a network. |

## 4. Drizzle — repository, transactions, the persistence boundary

| Source | Level | What it gives |
| --- | --- | --- |
| [Drizzle ORM — official documentation](https://orm.drizzle.team/) | P | Reference. The part that matters for the skill is `transaction()`, and that `tx` has the same shape as `db` — which is precisely why a repository can accept `tx` as a parameter. |
| [Drizzle ORM Best Practices: principles, patterns, case studies](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) | S | Closest to §6: **database errors are translated into domain errors at the repository boundary**, and the repository interface speaks in domain types. |
| [Repository Pattern with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) | S | The repository pattern over Drizzle in practice (a Nest example, but the pattern transfers). |
| [Transactions with DDD and Repository Pattern in TypeScript (part 2)](https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901) | S | Unit of Work: who owns the transaction boundary when several repositories are involved. The source of the rule "the service opens the transaction". |
| [Tomas Listiak — the TypeScript ORM that thinks in SQL](https://listiak.dev/blog/drizzle-orm-the-typescript-orm-that-thinks-in-sql) | S | Why Drizzle deliberately does **not** hide SQL — and why the repository here is therefore thin rather than "another ORM on top". |
| [Drizzle ORM Practical Patterns](https://dev.to/myougatheaxo/drizzle-orm-practical-patterns-type-safe-database-access-design-120c) | T | Type-safe access patterns. |

## 5. Enforcement — dependency-cruiser

`dependency-cruiser@17` was already a dependency, with no configuration. These
are the sources for §6 of the plan.

| Source | Level | What it gives |
| --- | --- | --- |
| [sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | P | The tool itself. Works with TypeScript and path aliases with no extra setup. |
| [Rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | P | The exact syntax of `forbidden` / `allowed` / `required`, `from`/`to`, `pathNot`, `severity`. The direct source for the config sketch. |
| [Validate Dependencies According to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c) | S | A ready-made rule set for a concentric architecture — the closest template to ours. |
| [Atomic Object — Restrict Imports in JavaScript](https://spin.atomicobject.com/dependency-cruiser-imports/) | S | Forbidding imports between layers, in practice. |
| [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b) | S | The specific rule "a module does not reach into a sibling's internals" (§4.5). |
| [Stop circular dependencies — dependency-cruiser & the Stable Dependencies Principle](https://dev.to/wojciech_kot_b82f5d7cbfc6/stop-circular-dependencies-before-they-stop-you-dependency-cruiser-the-stable-dependencies-34ho) | T | Circular dependencies as a rule of their own. |

## 6. The criticism — so the skill does not start breeding empty layers

These sources carry no less weight in the plan than section 1: they define §7,
where the onion is unnecessary.

| Source | Level | What it gives |
| --- | --- | --- |
| [Victor Rentea — Overengineering in Onion/Hexagonal Architectures](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/) | S | The sharpest expert criticism. Bluntly: if the domain is CRUD-shaped, the onion can be a worse choice than vertical slices or an anemic model. |
| [Three Dots Labs — Is Clean Architecture Overengineering?](https://threedots.tech/episode/is-clean-architecture-overengineering/) | S | A measured answer: the architecture is not the problem, applying it "by the book" is. |
| [Stop Overengineering in the Name of Clean Architecture](https://dev.to/criscmd/stop-overengineering-in-the-name-of-clean-architecture-b8h) | T | The thesis "start with controller/service/repository and grow as needed" — the criterion for when a service layer appears. |
| [Martin Fowler — Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html) | P | The classic article against the anemic model. Kept so that §8 of the plan is a deliberate decision rather than ignorance. |
| [DDD vs. Anemic Domain Models — codecentric](https://www.codecentric.de/en/knowledge-hub/blog/ddd-vs-anemic-domain-models) | S | The counter-argument: an anemic model is acceptable under a layered architecture with moderate domain complexity — which is this case. |
| [DevIQ — Anemic Model](https://deviq.com/domain-driven-design/anemic-model/) | T | A short definition for the skill's vocabulary. |

## 7. Not read — for the next revision

- [Fastify — Testing](https://fastify.dev/docs/latest/Guides/Testing/): how the
  layer boundary affects the split between integration and hermetic tests. A
  project's own testing guide may already settle part of this — check against it
  rather than duplicating it.
- Drizzle: relational queries vs hand-written joins at the repository boundary —
  whether the shape of the query leaks into the service.
- Palermo, parts 2–4: confirmed in this pass only through secondary retellings;
  quoting them in the skill requires reading the originals.
