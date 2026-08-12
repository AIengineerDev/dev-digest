# `onion-architecture` — джерела

Матеріал, на якому побудовано [`PLAN.md`](PLAN.md). Рівні довіри ті самі, що в
`frontend-ui-architecture/README.md`: **P** — першоджерело або автор концепції,
**S** — фахова думка з іменем, **T** — оглядовий контент, лише як сигнал.

Зібрано 2026-08-09.

---

## 1. Онія — першоджерела

| Джерело | Рівень | Що дає |
| --- | --- | --- |
| [Jeffrey Palermo — The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | P | Стаття, що ввела термін (2008). Мета — розірвати зчеплення з БД, яке ламає класичну шарувату схему. Далі частини 2, 3 і «part 4 — After Four Years» (2013) на тому ж блозі. |
| [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) | S | Найточніший розбір у серії *Software Architecture Chronicles*: чим онія відрізняється від шаруватої і від гексагональної, без маркетингу. |
| [NDepend — Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/) | S | Наголос саме на **напрямку** залежностей як на єдиній суті — те, що ми зробили §4 плану. |
| [Allegro Tech — Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html) | S | Продакшн-досвід команди, включно з тим, що не спрацювало. |
| [Dani Grudzynskyi — Unfolding infrastructure in the Onion architecture](https://dgrudzynskyi.github.io/dev-blog/architecture/2020/12/18/unfolding-infrastructure-in-onion-architecture.html) | S | Найкорисніше для нас: як розкладати інфраструктуру, коли адаптерів багато. |
| [DZone — Onion Architecture Is Interesting](https://dzone.com/articles/onion-architecture-is-interesting) | T | Оглядовий переказ; для перевірки, що нічого не пропущено. |
| [Onion Architecture vs Clean Architecture](https://dev.to/godofgeeks/onion-architecture-vs-clean-architecture-584h) | T | Розведення двох термінів, які часто плутають. |

## 2. Порти й адаптери — те, звідки онія бере механіку

| Джерело | Рівень | Що дає |
| --- | --- | --- |
| [Michael Scharhag — From layers to onions and hexagons](https://www.mscharhag.com/architecture/layer-onion-hexagonal-architecture) | S | Найясніший текст про перехід від шарів до онії: **БД перестає бути низом і стає краєм**. Це теза §3 плану. |
| [Ports and Adapters — Software Architecture wiki](https://synchronium.github.io/software-architecture-wiki/styles/ports-and-adapters.html) | S | Driving (primary) vs driven (secondary) адаптери — словник, якого нам бракує: наші `routes` = driving, `adapters/**` = driven. |
| [Hexagonal Architecture: повний гайд із прикладом на TypeScript (2026)](https://generalistprogrammer.com/tutorials/hexagonal-architecture-complete-guide) | S | Порт як TS-інтерфейс, адаптер як клас. Рівно наша модель у `@devdigest/shared` + `adapters/`. |
| [Chakray — Hexagonal Architecture: a complete guide](https://chakray.com/hexagonal-architecture-a-complete-guide-to-robust-and-testable-software-design/) | S | Акцент на тестованості — обґрунтовує `adapters/mocks.ts`. |
| [Ports and Adapters, Explained with Two Real Codebases](https://saadh393.github.io/blog/adapter-port-architecture-two-cases) | S | Два реальні кодбейси замість іграшкового прикладу. |
| [Alex Rusin — A Guide to Ports & Adapters](https://blog.alexrusin.com/future-proof-your-code-a-guide-to-ports-adapters-hexagonal-architecture/) | T | Практичний вступ. |
| [Hexagonal vs Clean vs Onion: що виживає у 2026](https://dev.to/dev_tips/hexagonal-vs-clean-vs-onion-which-one-actually-survives-your-app-in-2026-273f) | T | Порівняння трьох; корисне, щоб не змішувати термінологію в скілі. |
| [hexagonal_example_nodejs](https://github.com/fraybabak/hexagonal_example_nodejs) · [onion-architecture-node-js](https://github.com/hadyjsc/onion-architecture-node-js) | T | Референсні репо на Node/TS. Дивитись на розкладку папок, не копіювати код. |

## 3. Fastify — як шар HTTP і як DI

| Джерело | Рівень | Що дає |
| --- | --- | --- |
| [Fastify — Plugins (reference)](https://fastify.dev/docs/latest/Reference/Plugins/) | P | `register` створює новий скоуп; `decorate` не тече вгору. Це і є механізм інкапсуляції модуля — наша конвенція «один модуль = один плагін». |
| [Fastify — The hitchhiker's guide to plugins](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) | P | Офіційний гайд з побудови застосунку як дерева плагінів. |
| [fastify/help #284 — best practice for dependency injection](https://github.com/fastify/help/issues/284) | P | Відповідь мейнтейнерів: система плагінів **і є** DI; окремий DI-контейнер потрібен не завжди. Обґрунтовує, чому наш `platform/container.ts` лишається простим об'єктом, а не бібліотекою. |
| [Snyk — Fastify plugins as building blocks for a backend Node.js API](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/) | S | Плагін як одиниця композиції; кожен згодом може стати сервісом. |
| [Rafael Gonzaga — Fastify, why another framework?](https://blog.rafaelgss.dev/fastify-why-another-framework-js) | S | Модель інкапсуляції від людини з core-команди. |
| [Strapi — production-ready APIs with Fastify](https://strapi.io/blog/build-production-ready-apis-with-fastify) | T | Фабрика застосунку + `fastify.inject()` для тестів без мережі. |

## 4. Drizzle — репозиторій, транзакції, межа persistence

| Джерело | Рівень | Що дає |
| --- | --- | --- |
| [Drizzle ORM — офіційна документація](https://orm.drizzle.team/) | P | Довідка. Ключове для скіла — `transaction()` і те, що `tx` має ту саму форму, що й `db`: саме тому репозиторій може приймати `tx` параметром. |
| [Drizzle ORM Best Practices: principles, patterns, case studies](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) | S | Найближче до нашого §6: **помилки БД перекладаються в доменні на межі репозиторію**, інтерфейс репозиторію оперує доменними типами. |
| [Repository Pattern with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) | S | Практика репозиторію поверх Drizzle (приклад на Nest, патерн переносний). |
| [Transactions with DDD and Repository Pattern in TypeScript (part 2)](https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901) | S | Unit of Work: хто володіє межею транзакції, коли репозиторіїв кілька. Джерело правила «транзакцію відкриває сервіс». |
| [Tomas Listiak — the TypeScript ORM that thinks in SQL](https://listiak.dev/blog/drizzle-orm-the-typescript-orm-that-thinks-in-sql) | S | Чому Drizzle навмисно **не** ховає SQL — і чому через це репозиторій у нас тонкий, а не «ще одна ORM зверху». |
| [Drizzle ORM Practical Patterns](https://dev.to/myougatheaxo/drizzle-orm-practical-patterns-type-safe-database-access-design-120c) | T | Типобезпечні патерни доступу. |

## 5. Примус правил — dependency-cruiser

`dependency-cruiser@17` уже в `server/package.json`, але конфіга немає. Це джерела для §6 плану.

| Джерело | Рівень | Що дає |
| --- | --- | --- |
| [sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | P | Сам інструмент. Працює з TS і path-аліасами без додаткового налаштування. |
| [Rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | P | Точний синтаксис `forbidden` / `allowed` / `required`, `from`/`to`, `pathNot`, `severity`. Пряме джерело ескізу конфіга. |
| [Validate Dependencies According to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c) | S | Готовий набір правил під концентричну архітектуру — найближчий шаблон до нашого. |
| [Atomic Object — Restrict Imports in JavaScript](https://spin.atomicobject.com/dependency-cruiser-imports/) | S | Практика заборони імпортів між шарами. |
| [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b) | S | Саме правило «модуль не лізе у нутрощі сусіда» (наше §4.5). |
| [Stop circular dependencies — dependency-cruiser & the Stable Dependencies Principle](https://dev.to/wojciech_kot_b82f5d7cbfc6/stop-circular-dependencies-before-they-stop-you-dependency-cruiser-the-stable-dependencies-34ho) | T | Циклічні залежності як окреме правило. |

## 6. Критика — щоб скіл не почав плодити порожні шари

Ці джерела в плані важать не менше за розділ 1: вони визначають §7 (де онія зайва).

| Джерело | Рівень | Що дає |
| --- | --- | --- |
| [Victor Rentea — Overengineering in Onion/Hexagonal Architectures](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/) | S | Найгостріша фахова критика. Прямо: якщо домен CRUD-подібний, оня може бути гіршим вибором за вертикальні зрізи чи анемічну модель. |
| [Three Dots Labs — Is Clean Architecture Overengineering?](https://threedots.tech/episode/is-clean-architecture-overengineering/) | S | Зважена відповідь: не архітектура погана, а її застосування «за книжкою». |
| [Stop Overengineering in the Name of Clean Architecture](https://dev.to/criscmd/stop-overengineering-in-the-name-of-clean-architecture-b8h) | T | Теза «почни з controller/service/repository і рости за потребою» — наш критерій появи сервісу. |
| [Martin Fowler — Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html) | P | Класична стаття проти анемічної моделі. Тримаємо, щоб §8 плану був свідомим рішенням, а не незнанням. |
| [DDD vs. Anemic Domain Models — codecentric](https://www.codecentric.de/en/knowledge-hub/blog/ddd-vs-anemic-domain-models) | S | Контраргумент: анемічна модель прийнятна за шаруватої архітектури й помірної складності домену — це наш випадок. |
| [DevIQ — Anemic Model](https://deviq.com/domain-driven-design/anemic-model/) | T | Коротке визначення для словника скіла. |

## 7. Не читано — до наступної ревізії

- [Fastify — Testing](https://fastify.dev/docs/latest/Guides/Testing/): як межа шарів впливає на поділ `*.it.test.ts` / герметичних тестів. Наш `TESTING.md` це вже частково визначає — треба звірити, а не дублювати.
- Drizzle: relational queries vs ручні join-и на межі репозиторію — чи протікає форма запиту в сервіс.
- Palermo, частини 2–4: у цьому проході підтверджено лише через вторинні перекази; для цитати в скілі треба прочитати оригінали.
