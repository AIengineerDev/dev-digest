# Marketplace catalog site — a static, backend-less browser for this repo's artefacts

**Status:** draft
**Packages touched:** new `site/`, `.github/workflows/`, and read-only over
`.claude/`, `skills/`, `mcp/`, `evals/`, `.claude-plugin/` (planned), `plugins/`
(planned)
**Design source:** `design-mocks/src/14-screen_skills.jsx:215-234`
(`SkillSearchPanel` — "Search community skills", the only catalog-shaped surface
the design has) with its data at `design-mocks/src/05-data2.jsx:116-121`, and the
`@devdigest/ui` tokens at `client/src/vendor/ui/styles.css`. **There is no mock
for this feature.** Everything below marked `no mock` is specified from the
brief, not from pixels.
**Supersedes:** nothing.
**Borders on:** `specs/13-eval-pipeline.md` — that spec owns eval *runs* and
their scoring inside the studio; this one only **reads** the records they leave
in `evals/results/records.jsonl:1` and renders a badge. It never triggers a run.
Also borders on `specs/02-skills.md`, which owns product skills as application
data; this spec treats `skills/*` as one more indexable source and changes
nothing about it.

---

## Problem

The repository now carries a set of agent artefacts that only exist as files:
seven skills with a `SKILL.md`, eight subagents, one `PreToolUse` hook, five MCP
tools, one product skill and three eval suites. None of them has a type checker
and none has a test suite of its own — `AGENTS.md` ("After changing a skill, an
agent, or this file") says so, and `evals/quality.ts` exists precisely because a
broken description fails silently, at routing time, in someone else's session.

Three consequences today:

1. **Nobody outside the repo can find them.** The repo is about to publish
   itself as a Claude Code plugin marketplace, and a `marketplace.json` is not a
   thing a human browses.
2. **Nobody inside the repo can find them either.** The only way to answer "is
   there a skill for X" is to `ls .claude/skills` and read seven descriptions.
   The CTO asks this question in Ukrainian ("мені треба скіл для X"), which no
   filename match will ever answer.
3. **Routing is invisible.** A skill activates because of phrases buried in its
   `description` (e.g. `.claude/skills/onion-architecture/SKILL.md:3`). There is
   no surface where a person can read *what makes this fire*, so a description
   that stopped routing looks identical to one that works.

There is no `site/` package, no `.claude-plugin/` directory, no `plugins/`
directory and no Pages workflow — `.github/workflows/` holds six package gates
(`client.yml`, `evals.yml`, `mcp.yml`, `reviewer-core.yml`,
`server-integration.yml`, `server-unit.yml`) and nothing else.

---

## Governing principle — the site has no data of its own

The repository is the single source of truth. Every description, version, tool
list and model name the site displays is read from the artefact's own frontmatter
at build time and is **never** re-typed into `site/`. A build-time generator
walks the repo and emits the index; a CI gate fails the PR when the committed
index no longer matches a fresh generation.

This is the same class of protection as `evals/quality.ts`: deterministic, free,
fast, and blocking. It is here because drift in these files is silent.

The only content `site/` authors itself is: the alias table (R6), a
category/tag map (R16), and its own UI chrome strings (NFR i18n).

---

## Scope — in / out

**In** — every requirement below, at the stated priority.

**Out**, each with the reason:

| Out | Reason |
| --- | --- |
| Ratings, comments, install counters, "trending" | All need a server write path. The site has no backend and no origin it may write to |
| GitHub Issues as a database | Rejected: unauthenticated reads are rate-limited per IP, and an authenticated write from a static frontend means shipping a token in the bundle |
| Semantic / embedding search | See [Semantic search](#semantic-search--out-of-v1-and-why) |
| Runtime analytics | Only possible via a third-party script (GoatCounter, Plausible). It is a privacy and a dependency decision, not a technical one → **Q6** |
| Any write path at all — no forms, no auth, no cookies | R12 |
| Rendering bodies of plugins whose `source` is external (github/npm/archive) | The site has no local file to render → C8, R9 |
| Changing any artefact to suit the site | One exception, stated as a requirement: hooks have no description field today → **R21** |
| Publishing `site/` to npm, or consuming it from `client/` | It is a leaf package. Nothing imports it |

### Semantic search — out of v1, and why

Query-time semantic search needs the *query* embedded, which means either an
embedding model in the browser (the smallest useful ones are tens of MB, against
an index budget of 300 KB — R13) or a backend, which this site does not have.
Precomputing document embeddings in CI does not help: without a query vector
there is nothing to compare against.

Revisit when **all three** are true: (a) the alias table (R6) has stopped
absorbing the misses — measured by unresolved queries reported through R18;
(b) the artefact count is past ~100, where lexical ranking starts to blur; and
(c) either a hosted embedding endpoint is acceptable, or a browser-sized model
lands that fits the budget. Until then, R6 is the deterministic, reviewable,
zero-cost substitute.

---

## Requirements

Priority: **P1** ships or the release does not · **P2** first follow-on ·
**P3** valuable, sequence last.

| ID | Pri | Requirement | Source |
| --- | --- | --- | --- |
| R1 | P1 | One build-time generator walks the repo and emits (a) a single metadata index and (b) one detail payload per artefact. It is **deterministic**: two runs on the same tree produce byte-identical output, with stable key order and no timestamps, absolute paths, or hostnames in the output | Governing principle; determinism is what makes R2 checkable |
| R2 | P1 | A CI job fails the pull request when the committed index differs from a fresh generation, naming the artefacts that drifted and the command that fixes it. It runs on a path filter covering every indexed source | `.github/workflows/evals.yml:16-27` is the model for the filter; `AGENTS.md` "After changing a skill, an agent, or this file" |
| R3 | P1 | No artefact description, version, tool list or model name is authored inside `site/`. Every displayed field carries the repo-relative source path it came from, and the detail page shows that path as a link to the file on GitHub | Governing principle |
| R4 | P1 | The generator indexes exactly these classes, and records the class on each entry: **skill** (`.claude/skills/*/SKILL.md`, frontmatter `name`, `description`, `version`, optional `disable-model-invocation`) · **agent** (`.claude/agents/*.md` except `README.md`, frontmatter `name`, `description`, `tools`, `model`) · **hook** (`.claude/hooks/*.mjs` + its wiring in `.claude/settings.json:5`) · **mcp-tool** (the tools registered in `mcp/src/server.ts:29-37`, with the `name`, `title`, `description` and input schema from each `mcp/src/tools/*.ts`) · **product-skill** (`skills/*/README.md`) · **plugin** (`plugins/*/.claude-plugin/plugin.json`) · **marketplace** (`.claude-plugin/marketplace.json`) | `.claude/skills/onion-architecture/SKILL.md:2-4`; `.claude/agents/spec-creator.md:2-5`; `mcp/src/tools/get-blast-radius.ts:19-23`; `skills/api-contract-reviewer/README.md` |
| R5 | P1 | Search is client-side and lexical, over an index **serialized at build time and never rebuilt in the browser**. It supports prefix and fuzzy matching, and boosts `name` above `description` above body. A query returns results in under the R13/NFR-latency budget with the network offline | Brief (MiniSearch decision, taken); R11 |
| R6 | P1 | A committed, reviewable alias table (`site/aliases.json`) maps colloquial phrasings to artefact names. It is data, not a model: an entry is `{ phrase, artefact, note }`, it is diffed in review like any other file, and a phrase naming an artefact that does not exist fails the R2 gate | Brief; the same discipline as `skills-lock.json` |
| R7 | P1 | A result card shows: type, name, one-line summary derived from the source description, owning plugin, version, and highlighted match spans. A card for an artefact with no version shows the type badge in that slot rather than an empty one | `design-mocks/src/14-screen_skills.jsx:226-234` is the nearest shape (name · desc · repo · badge · action) |
| R8 | P1 | Every card and every detail page carries a copy-to-clipboard control for both the marketplace command and the plugin command, with the real owner/repo of this repository substituted, not a placeholder | `.git/config:9` → `AIengineerDev/dev-digest` |
| R9 | P1 | The detail page renders the artefact's body (the `SKILL.md` or agent prompt after its frontmatter), its frontmatter as a labelled table (`tools`, `model`, `version`, `disable-model-invocation`), a permalink, and a "copy raw" control that yields the exact file bytes | Brief; `.claude/agents/architecture-reviewer.md:2-5` |
| R10 | P1 | Every artefact has a **real static page** at a stable path. Deep links resolve without a `404.html` SPA fallback. Every link, asset URL and fetch is base-path aware for `/<repo>/`, and the build emits `.nojekyll` | Pages serves from a subpath; Jekyll strips `_next` |
| R11 | P1 | Once loaded, the site works with the network off: search, filters, the bundle builder and any detail page already visited. A detail payload not yet fetched shows an explicit offline state, not a spinner that never ends | Brief; C10 |
| R12 | P1 | The site makes **no** request to any origin other than its own static assets at runtime, holds no secret, and has no write path. Anything needing a key (eval runs, any future embedding pass) happens in CI | Brief; NFR Security |
| R13 | P1 | The eagerly-loaded metadata index (search index + card fields for every artefact) stays **under 300 KB uncompressed**. Full artefact bodies are split into per-artefact payloads fetched only on the detail page. Exceeding the budget fails the build with the current size | Brief; NFR Scale |
| R14 | P1 | `site/` is a standalone package with its own `package.json` and its own lockfile, using **pnpm**, matching `client/` — it is the second Next.js app in the repo and shares its React 19 / Next 15 posture (`client/package.json:18,20`). It never becomes part of a workspace | root `INSIGHTS.md:85-93`; `AGENTS.md` "Conventions"; the `repo-conventions` skill |
| R15 | P1 | The generator reads sources **by path at build time only**. `site/` imports no module from `server/`, `client/`, `mcp/`, `reviewer-core/` or `evals/` — with one allowed exception, the vendored UI barrel `@devdigest/ui` (`client/src/vendor/ui/index.ts:4-13`) and its `styles.css`, consumed as source through a tsconfig path alias | root `INSIGHTS.md:85-93`; `client/src/vendor/ui/README.md:1` |
| R16 | P1 | The source manifest is explicit and asserted: the generator declares the globs it walks and a **minimum expected count per class**. A source directory that moves or empties fails the generator loudly, naming the glob that matched nothing, rather than silently emitting a smaller index | C7; this is the failure mode R2 alone cannot catch |
| R17 | P2 | Filters: type, owning plugin, category, tag, "has evals", and minimum Claude Code version. Filters compose, are reflected in the URL so a filtered view is linkable, and each shows its result count | Brief |
| R18 | P2 | Every surface carries a feedback affordance that opens a **prefilled GitHub issue** — title, the artefact or the query that produced it, and the site version. Zero-result search prefills a "no result for this query" issue, which is how R6's alias gaps get reported | Brief; the only feedback channel that needs no backend |
| R19 | P2 | Eval badges on cards and detail pages: case count, the most recent recorded score and the date it was recorded, read from `evals/results/records.jsonl:1` and the suite directories. An artefact with **no** eval cases shows an explicit warning state whose wording matches what the free gate already reports | `evals/src/quality.ts` (`hasEvalCoverage`, and the `no eval coverage` warning it emits); `evals/README.md` ("Three levels") |
| R20 | P2 | Bundle builder: the user selects N artefacts and the site produces a ready-to-paste `.claude/settings.json` block containing the marketplace and the selected plugins, both copyable and downloadable as a file. The selection is reflected in the URL so a bundle is shareable | Brief; Q1 pins the exact key names |
| R21 | P2 | A hook is indexed with a real description. Hooks have no frontmatter today — `.claude/hooks/spec-creator-guard.mjs:1-14` is a shebang and a comment block — so **the source must gain a machine-readable description**, and the generator must fail on a hook that lacks one rather than inventing text. Which mechanism is Q3 | `.claude/hooks/spec-creator-guard.mjs:1-14`; R3 forbids authoring the text in `site/` |
| R22 | P3 | Relationship graph over skill ↔ agent ↔ hook ↔ MCP tool ↔ eval, derived **only** from cross-references that already exist in the sources. Every edge names the file and line it was read from; an edge with no citation is not drawn | `.claude/skills/onion-architecture/SKILL.md:3` points at `frontend-ui-architecture`; `.claude/skills/dependency-checker/SKILL.md:3` points at three others; `.claude/agents/README.md:44-68` is an explicit handover graph |
| R23 | P3 | Boundary view: pairs of artefacts that deliberately delimit each other, each shown as "use A when… / use B when…", quoting the delimiting sentence from each side's own description | `.claude/skills/repo-conventions/SKILL.md:3` ("backend layering lives in onion-architecture, client placement in frontend-ui-architecture, external packages in dependency-checker") |
| R24 | P3 | Trigger explorer: the phrases inside a `description` that cause routing are extracted and displayed as a list, with the raw description shown alongside so a reader can see what was extracted and what was not. Extraction is heuristic and must be labelled as such | `.claude/skills/engineering-insights/SKILL.md:3`; `evals/README.md` ("Three levels" — `eval:workflow` is what proves routing) |
| R25 | P3 | Per-artefact changelog from git history at build time, plus a site-wide RSS feed of artefact additions and changes. The generator must not assume a full clone — see C11 | Brief; `git log --follow` over `.claude/skills/onion-architecture/SKILL.md` returns 4 commits today |
| R26 | P3 | Every artefact page emits Open Graph and Twitter card metadata with a pre-rendered image, so a link pasted into Slack previews as name + type + summary | Brief; Q5 |
| R27 | P1 | Search input accepts and matches non-Latin text, specifically Cyrillic. A Ukrainian query for a concept covered by the alias table (R6) returns the artefact; a Ukrainian query with no alias entry returns the zero-result state (R28) with the R18 feedback prefill, never a broken or empty page | Problem §2; C1 |
| R28 | P1 | Four search states are distinct and each is designed: **before any query** (browse-all, grouped by type) · **query with results** · **query with zero results** (offers the nearest alias matches and the R18 prefill) · **filters applied that exclude everything** (offers "clear filters", which is a different remedy from a bad query) | Design gap; nothing in `14-screen_skills.jsx` draws any of them |

---

## Design analysis

### States the design covers

`design-mocks/src/14-screen_skills.jsx:215-234` draws exactly one relevant
surface and only its happy path: a 480px drawer titled "Search community skills"
with a filled search box showing `security review` (`:217-219`), four chips —
`All languages` active, `TypeScript`, and two tag chips (`:220-224`) — and four
result cards, each with a mono name, a star count, a description, a repo, a
language badge and an `Import` button (`:226-234`). Its data is four hardcoded
objects at `design-mocks/src/05-data2.jsx:116-121`. It is opened from a menu
entry at `:257`.

Nothing else in the 31 mock modules touches a catalog. There is no detail page,
no graph, no badge, no bundle builder, no empty state.

**`design-mocks/` is gitignored** (`.gitignore:22`, with the reason at
`:17-21`). It exists on the CTO's machine and in **no** CI checkout. So it is a
reference for *this spec* and must never become a build input — R15 routes the
site's visual language through the committed `@devdigest/ui` instead. This is
the most consequential correction to the brief.

### States it does not

| Axis | Gap in the mock | Requirement |
| --- | --- | --- |
| Emptiness | No pre-query state, no zero-results state, no all-filters-excluded state; the mock's box is permanently pre-filled (`:218`) | R28 |
| Emptiness | An artefact with **no evals** — the mock has no badge at all | R19 |
| Cardinality | Four cards, hand-sized (`05-data2.jsx:116-121`). One result, and the ~22 artefacts today growing past a scroll, are both undrawn | R7, R17 |
| Extremes | The longest real description is 604 characters (`.claude/skills/dependency-checker/SKILL.md:3`); the mock's card allots one line (`14-screen_skills.jsx:230`). Truncation rule, and where the full text is readable, are unspecified | C4, R7 |
| Time | No loading state for a detail payload, no slow-fetch state, no offline state | R11, C10 |
| Failure | A detail payload that 404s because the artefact was deleted after the link was shared | C3, R11 |
| Permission | Not applicable in the mock's frame, and not applicable here: the site is public, read-only and anonymous. The one real permission fact — **the repo must be public** for both Pages and `/plugin marketplace add owner/repo` — is a deploy precondition, not a UI state | R10, Q4 |
| Concurrency | Not applicable at runtime (the site is immutable between deploys). It applies at **build** time: an index generated from a tree that changed underneath | R2, C9 |
| Reachability | The mock is a drawer over the Skills Lab (`:257`). This site is a separate origin: how a user arrives (marketplace README, a shared deep link, Slack unfurl), and what the back button does after a filtered search, are undrawn | R10, R17, R26 |

### Divergence from the mock and from `client/` today

| Mockup | Today | Intended change (→ Rn) or oversight (→ Qn) |
| --- | --- | --- |
| Star counts on every card (`14-screen_skills.jsx:229`) | Nothing counts stars; the artefacts are files in one repo | **Mockup oversight** — a popularity number with no source is a lie the reader cannot check → dropped, see the ratings row in Scope-out |
| `Import` button per card (`:234`) | The studio imports skills into its own database (`specs/02-skills.md`) | Intended change → **R8**: the catalog's action is *copy the command*, because the site cannot write to anyone's machine |
| `repo` shown per card (`:232`) | Every artefact here belongs to one repo | Intended change → **R7**: the slot shows the **owning plugin**, which is the axis that actually varies |
| Language badge `TypeScript`/`any` (`:233`) | Skills are not language-scoped; `mcp` tools and hooks are not either | Intended change → **R17**: replaced by type / plugin / has-evals / min-version, which are real fields |
| A drawer inside the studio (`:215`) | — | Intended change → **R10**: a standalone static site with real per-artefact URLs, because a drawer cannot be deep-linked or unfurled |
| — | `client/next.config.mjs` sets neither `output: 'export'` nor `basePath` | Intended: `site/` is a new package and does not change `client/`'s config → **R10, R14** |

### UX improvements proposed

Each is `proposed`, for the designer to accept or reject.

- `proposed` — **Show the trigger phrases on the card, not only on the detail
  page** (R24). Reason: "which skill fires when I say X" is the actual question,
  and answering it in the result list saves a navigation per candidate.
- `proposed` — **Make the no-evals warning (R19) a neutral fact, not a red
  alarm.** Reason: `evals/src/quality.ts` deliberately emits it as a *warning*
  because "the skills that predate the harness would hold the gate red forever".
  A catalog that renders that as failure teaches readers to distrust every badge.
- `proposed` — **The zero-result state should show the three nearest alias
  entries, not just "no results"** (R28). Reason: the alias table is the
  mechanism that fixes the miss, and showing it teaches the user that the miss
  is fixable by a PR.
- `proposed` — **Group the browse-all state by type with counts** (R28).
  Reason: with ~22 artefacts, "what exists at all" is answerable in one screen,
  and that is the first question a newcomer has.
- `proposed` — **Put the boundary pair (R23) inline on the detail page of each
  artefact in the pair**, not only in a separate view. Reason: the moment the
  disambiguation is needed is while reading one of the two.
- `proposed` — **Show the source path as the artefact's subtitle** (R3).
  Reason: it is the fastest possible answer to "is this current", and it makes
  the governing principle visible rather than merely true.

---

## Module interaction

`site/` has no runtime dependency on any other package. Every seam is a
**build-time file read**, which is why each row's failure column is about the
build, not the browser.

| From → to | Contract | Sync? | If the far side is missing or moved | Requirement |
| --- | --- | --- | --- | --- |
| generator → `.claude/skills/*/SKILL.md` | YAML frontmatter `name`/`description`/`version`, the same four keys `evals/src/quality.ts` (`frontmatter`) already parses | build-time | Glob matches nothing → generator fails naming the glob. A directory with no `SKILL.md` is **not** an error — it is skipped and reported, exactly as `checkSkills` does | R4, R16, C2 |
| generator → `.claude/agents/*.md` | frontmatter `name`/`description`/`tools`/`model`; `README.md` excluded, as `checkAgents` excludes it | build-time | Same as above | R4, R16 |
| generator → `.claude/hooks/*.mjs` + `.claude/settings.json:5` | The hook file plus its matcher and event from settings | build-time | A hook file with no wiring is indexed as **unwired** and says so; wiring naming a missing file fails the build | R4, R21, C6 |
| generator → `mcp/src/tools/*.ts` | Tool `name`, `title`, `description` as registered (`mcp/src/tools/get-blast-radius.ts:19-23`) | build-time | If the registration shape changes so nothing is extractable, the class count assertion (R16) fails rather than the class silently emptying | R4, R16 |
| generator → `evals/` | `evals/results/records.jsonl` lines and the suite dirs `evals/skills/<n>/<n>.cases.ts`, `evals/agents/<n>/`, `skills/<n>/evals/expected.json` | build-time | Missing records file → every badge renders "never evaluated", which is a true statement, not an error | R19, C5 |
| generator → git | `git log --follow` per artefact path | build-time | A shallow clone yields no history → changelog renders "history unavailable in this build" and the build still succeeds | R25, C11 |
| `site/` → `@devdigest/ui` | tsconfig path alias into `client/src/vendor/ui`, barrel-only import (`index.ts:4-13`) | compile-time | A moved vendor directory breaks the typecheck loudly. `site/` must not modify anything under `**/src/vendor/**` | R15 |
| CI → Pages | The built static output, deployed by `.github/workflows/site.yml` | — | A failed deploy leaves the previous deploy serving; the R2 gate is separate and blocks the PR before deploy | R2, R10 |

**The seam that will actually move.** `.claude/*` is gitignored except four
allowlisted paths (`.gitignore`, `.claude/*` block). If a fifth artefact type is
added under `.claude/` without an allowlist entry, it is invisible to CI, the
generator indexes it locally and not in CI, and R2 fails on a machine where
nothing is wrong. R16's per-class assertion is what turns that into a legible
error.

---

## Contract changes

**None in `@devdigest/shared`.** Nothing the site reads passes through a Zod
contract today, and adding one would put artefact metadata in a package the
site is forbidden to import (R15).

Two **new** committed shapes, owned by `site/` and versioned in the repo:

- `site/aliases.json` — `{ phrase, artefact, note }[]` (R6).
- The generated index and per-artefact payloads (R1), committed, gated by R2.

One shape change **outside** `site/`: hooks need a machine-readable description
(R21). The mechanism is Q3.

---

## Corner cases

| ID | Case | Expected behaviour | Requirement |
| --- | --- | --- | --- |
| C1 | Query is Cyrillic — `скіл для архітектури` | Tokenized and matched with the same pipeline as Latin text. If the tokenizer or case-folding does not handle Cyrillic by default, the generator and the client must both use the same explicit override — the index and the query must never be normalized differently, or every non-Latin query silently returns nothing | R5, R27 |
| C2 | A skill-shaped directory with no `SKILL.md` — true today of `.claude/skills/pr-self-review/` (only `PLAN.md`) and `.claude/skills/react-component-quality/` (only `README.md`) | Not indexed as a skill. Listed in a build report as "notes in the skills folder, not loadable", the same wording class `checkSkills` uses. It is **not** a build failure | R4, R16 |
| C3 | A shared deep link to an artefact deleted since the deploy | Detail page 404s at the static host. The site's 404 page must name the artefact slug from the URL, state that it no longer exists in this repository, link to search and to the R18 issue prefill — not a bare Pages 404 | R10, R18 |
| C4 | A 604-character description (`.claude/skills/dependency-checker/SKILL.md:3`) on a card designed for one line | Card clamps to two lines with an ellipsis and no reflow; the full text is on the detail page and in the copied raw file. The **whole** description is still indexed for search — truncation is display-only, or search stops finding the tail of every long description | R7, R5 |
| C5 | An artefact with eval cases but zero recorded runs (true today for `architecture-reviewer`: cases exist at `evals/agents/architecture-reviewer/architecture-reviewer.cases.ts`, and `evals/results/records.jsonl` holds only `onion-architecture` records) | Badge reads "N cases · never run", distinct from "no cases". Two different gaps, two different remedies | R19 |
| C6 | A hook file present but not wired in `.claude/settings.json:5` | Indexed and badged **unwired**, with the sentence that a hook not named in settings never fires. The reverse — settings naming a missing file — fails the build | R4, R21 |
| C7 | A source directory is renamed (`.claude/agents/` → elsewhere) | The generator fails naming the glob that matched nothing and the class whose minimum count was not met. It never emits a smaller index that then passes R2 | R16 |
| C8 | A plugin whose `source` is external (github / npm / archive) | Indexed from the marketplace entry's metadata only. The detail page shows name, description, version, source and the copy commands, plus an explicit "body not available — this plugin lives outside this repository" panel. It is **never** fetched at runtime (R12) | R9, R12 |
| C9 | Local dev with a stale index — someone edits a `SKILL.md` and the dev server shows the old text | The dev server compares index mtimes against the source mtimes on load and shows a persistent, dismissible banner naming the stale artefacts and the regenerate command. Silent staleness in dev is how a stale index reaches a PR | R1, R2 |
| C10 | The user opens a detail page while offline and its payload was never fetched | An explicit "not available offline — this page has not been opened before" panel with a retry, not an infinite spinner. Search, filters and every previously-visited page keep working | R11 |
| C11 | The Pages workflow checks out with the default shallow depth, so `git log` returns nothing | Changelog renders "history unavailable in this build" and RSS is emitted empty rather than wrong. The workflow must fetch enough depth for history; a shallow build must degrade, never fabricate dates | R25 |
| C12 | The same artefact is shipped by two plugins | One canonical entry keyed by source path, listing every owning plugin, with one copy-command per plugin. It is **not** two cards — a duplicated card makes the reader choose between identical things | R4, R7, R8 |
| C13 | A plugin was renamed and the marketplace carries a rename mapping | The old name resolves — search matches it and the old URL redirects to the new page via a static redirect stub, with a "renamed from X" note on the detail page. A rename must not break a link that was already shared | R10, Q1 |
| C14 | An artefact body contains raw HTML, a `<script>`, or a `javascript:` link — plausible for a skill teaching about XSS | Markdown is rendered with HTML disabled and links scheme-restricted. Artefact bodies are treated as untrusted input even though they are first-party, because C8's neighbours are not | NFR Security, R9 |
| C15 | `.claude-plugin/marketplace.json` does not exist yet (true today) | The generator emits the catalog with the marketplace entry absent, and every copy-command control renders disabled with "marketplace not published yet". The site is buildable before the marketplace lands | R4, R8 |
| C16 | Two alias entries map the same phrase to different artefacts | The R2 gate fails on the duplicate phrase, naming both entries. Ambiguity resolved in review, not at query time | R6 |

---

## Non-functional requirements

| Axis | Bound | Requirement | `n/a` because |
| --- | --- | --- | --- |
| Latency | A keystroke updates results within **100 ms** at the current corpus (~22 artefacts) and within 250 ms at 200. Beyond that, results render with a visible "searching" state rather than blocking input | R5, R13 | |
| Scale | Index budget **< 300 KB uncompressed** eagerly loaded (R13); largest single artefact body ~50 KB; corpus sized for **200** artefacts. Past the budget the build fails with the measured size — it never ships a slow first load quietly | R13 | |
| Cost | **Zero** LLM calls, at build and at runtime. The site adds nothing to `costUsd`. The only spend it can ever display is what `evals/results/records.jsonl:1` already recorded | R12, R19 | |
| Failure | Generator: hard-fail on a missing glob (C7), a dangling alias (R6), a settings-wired missing hook (C6), a budget overrun (R13). Degrade-with-a-message on missing git history (C11) and missing eval records (C5). Runtime: no dependency exists to fail except the static host | R16, R11 | |
| Security | Artefact bodies are **untrusted input** — HTML disabled, link schemes restricted (C14). No secret, no token, no key in the bundle or in the repository; anything needing one runs in CI (R12). No third-party runtime script unless Q6 is answered otherwise. The site is public and anonymous, so there is no user data to protect — and equally, nothing may be collected | R12, C14 | |
| Accessibility | Search input is the initial focus and reachable by `/`. Results are a keyboard-navigable list; the copy controls are real buttons with a live-region confirmation, not icon-only affordances. The relationship graph (R22) ships with an equivalent list view — a graph that is only a canvas is unreachable | R5, R8, R22 | |
| i18n | UI chrome strings live in a single message catalogue in `site/` from the first commit, mirroring `client/messages/en/*.json`. **English-only in v1** — but a hardcoded chrome string is a defect. Artefact content is never translated; it is quoted from the repo. Search *input* must accept any script (R27) | R27, Q7 | |
| Observability | The build emits a report — per-class counts, the skipped directories (C2), the size against the budget, and the artefacts that drifted (R2) — printed in the CI log and committed alongside the index so a bad deploy is diagnosable from the repo alone. No runtime telemetry (Q6) | R2, R16 | |

---

## Acceptance criteria

| ID | Criterion — checkable from outside | Req | Verify by |
| --- | --- | --- | --- |
| A1 | Running the generator twice on a clean tree produces byte-identical output: the second run leaves `git status --porcelain` empty | R1 | manual command · `site/` test |
| A2 | Editing one character of `description` in `.claude/skills/onion-architecture/SKILL.md` and pushing makes the site CI job **fail**, and its output names `onion-architecture` and the regenerate command | R2 | `.github/workflows/site.yml` on a scratch PR |
| A3 | `grep -r` for the literal first eight words of any indexed description finds it **only** in its source file and in generated output — never in a hand-authored file under `site/src/` | R3 | manual command |
| A4 | A fresh index contains exactly 7 skills, 8 agents, 1 hook, 5 mcp-tools and 1 product-skill for the tree at this spec's commit, and each entry carries its source path | R4, R16 | `site/` test with committed expected counts |
| A5 | With DevTools offline after first load, typing `onion` returns `onion-architecture` as the top result and no network request is issued | R5, R11, R12 | manual click · `site/` test |
| A6 | Adding an alias entry pointing at `no-such-skill` makes the gate fail naming that entry; two entries with the same `phrase` also fail | R6, C16 | `site/` test |
| A7 | The card for `spec-creator` shows type `agent`, its version-or-type slot filled, its owning plugin, and highlighted spans on the matched terms | R7 | `site/` test |
| A8 | The copy control yields a string containing `AIengineerDev/dev-digest` — the value in `.git/config:9` — and no placeholder such as `owner/repo` | R8 | `site/` test |
| A9 | `/…/agents/spec-creator/` renders the prompt body, a frontmatter table containing `tools` and `model` exactly as at `.claude/agents/spec-creator.md:4-5`, and a "copy raw" control whose output is byte-identical to the file | R9 | `site/` test |
| A10 | Fetching every emitted artefact URL from the built output returns a real HTML file — no `404.html` fallback in the tree; `.nojekyll` exists at the output root; and every `<a href>` and asset URL in the output starts with the base path | R10 | `site/` test over the export directory |
| A11 | Serving the built output from a subdirectory with the network blocked, search and a previously-visited detail page both work; an unvisited detail page shows the offline panel and not a spinner | R11, C10 | manual click |
| A12 | Static analysis of the built bundle finds no `fetch`/`XMLHttpRequest` target outside the base path, and no string matching a secret-shaped pattern | R12 | `site/` test |
| A13 | The eagerly-loaded index is under 300 KB uncompressed; inflating a fixture corpus past the budget fails the build with the measured size in the message | R13 | `site/` test |
| A14 | `cd site && pnpm install --frozen-lockfile && pnpm build` succeeds; `site/` contains `pnpm-lock.yaml` and no `package-lock.json` | R14 | manual command |
| A15 | No file under `site/src/` imports from `server/`, `client/` (except the `@devdigest/ui` alias), `mcp/`, `reviewer-core/` or `evals/`; `git diff` for this feature touches nothing under `**/src/vendor/**` | R15 | `site/` test · manual command |
| A16 | Renaming `.claude/agents/` in a scratch tree makes the generator exit non-zero naming that glob and the unmet minimum count — it does not emit an index with zero agents | R16, C7 | `site/` test |
| A17 | Selecting type `skill` + `has evals` narrows to the artefacts `hasEvalCoverage` reports true for, shows a count, and the resulting URL reproduces the filtered view in a fresh tab | R17, R19 | `site/` test · manual click |
| A18 | The feedback control on a zero-result search opens a `github.com/AIengineerDev/dev-digest/issues/new` URL whose prefilled body contains the query string verbatim | R18 | manual click |
| A19 | `onion-architecture` shows a badge with a case count and the score and date from `evals/results/records.jsonl:1`; `architecture-reviewer` shows "cases · never run"; a skill with neither shows the no-coverage warning in the non-alarming treatment | R19, C5 | `site/` test |
| A20 | Selecting two artefacts produces a JSON block that parses, contains both, and — pasted into a scratch `.claude/settings.json` — is accepted by Claude Code without a config error | R20 | `site/` test · manual verification in Claude Code |
| A21 | The hook entry shows a description that also exists in the hook's own source (A3 holds for it too), and deleting that description makes the generator fail rather than emit a hook with an empty summary | R21 | `site/` test |
| A22 | The graph contains an edge `onion-architecture → frontend-ui-architecture` citing `.claude/skills/onion-architecture/SKILL.md:3`, and contains **no** edge without a citation | R22 | `site/` test |
| A23 | The boundary view pairs `repo-conventions` with each of the three artefacts named at `.claude/skills/repo-conventions/SKILL.md:3`, quoting that sentence | R23 | `site/` test |
| A24 | `engineering-insights`' trigger list includes `"record insights"` and `"what do we already know about X"`, both present verbatim at `.claude/skills/engineering-insights/SKILL.md:3`, and the raw description is displayed alongside | R24 | `site/` test |
| A25 | `onion-architecture`'s changelog lists the 4 commits `git log --follow -- .claude/skills/onion-architecture/SKILL.md` returns; the RSS feed validates; building from a `--depth 1` clone yields "history unavailable" and exit 0 | R25, C11 | `site/` test · manual command |
| A26 | Every artefact page has `og:title`, `og:description` and an `og:image` that resolves to a real file in the output; the image URL is absolute and includes the base path | R26 | `site/` test |
| A27 | Typing `скіл для архітектури` with the matching alias entry present returns `onion-architecture`; removing that entry returns the zero-result state with the feedback prefill and no error in the console | R27, R6, C1 | `site/` test · manual click |
| A28 | Each of the four states in R28 is reachable and visually distinct: empty input, a query with hits, a query with none, and a filter combination with none — the last offering "clear filters" rather than a query suggestion | R28 | `site/` test · manual click |
| A29 | A markdown fixture containing `<script>alert(1)</script>` and a `javascript:` link renders as inert text with no script execution and no live link | C14 | `site/` test |
| A30 | With `.claude-plugin/marketplace.json` absent, the build succeeds and every copy-command control renders disabled with the "not published yet" message | C15, R8 | `site/` test |
| A31 | Two plugins declaring the same artefact produce one card listing both owners and two copy commands, not two cards | C12 | `site/` test |
| A32 | A build report file exists in the output with per-class counts, the skipped directories (`pr-self-review`, `react-component-quality`), and the index size against the budget | Observability, C2 | `site/` test |

---

## Traps

- **`design-mocks/` is gitignored** (`.gitignore:22`). A build step that reads it
  works on the CTO's machine and fails in every CI checkout. The committed
  design surface is `client/src/vendor/ui/` (barrel at `index.ts:4-13`, tokens at
  `styles.css`), and R15 says that is the only one `site/` may use.
- **`.claude/*` is gitignored with a four-path allowlist.** A new artefact class
  under `.claude/` is invisible to CI until the allowlist gains an entry, which
  produces the confusing failure mode described under Module interaction.
- **`actions/checkout` is shallow by default**, so `git log` in the Pages job
  returns nothing and the changelog silently empties (C11). This is the kind of
  failure that ships looking fine.
- **Three directories look like skills and are not**:
  `.claude/skills/pr-self-review/` (only `PLAN.md`),
  `.claude/skills/react-component-quality/` (only `README.md`), and
  `skills/api-contract-reviewer/`, which is *product* data with no `SKILL.md` by
  design — `evals/src/quality.ts` has a separate `checkProductSkills` for exactly
  that reason. Indexing all three as skills would publish three artefacts that
  cannot be used.
- **Two independent things are called "skills."** `.claude/skills/**` are Claude
  Code skills; `skills/**` are bodies of text the application manages for its
  users. They must not merge into one catalog type.
- **Not a workspace.** `site/` gets its own `package.json` and its own lockfile
  (R14). The `repo-conventions` skill is the gate that catches a second lockfile
  in the wrong place, and root `INSIGHTS.md:85-93` records that the split is
  load-bearing for the per-package CI path filters.
- **`pnpm arch` (11 baselined violations) and `client pnpm lint` (43
  pre-existing warnings) are baselined.** Adding `site/` must not regenerate
  either baseline.
- **A committed generated file plus a staleness gate means every artefact PR now
  carries an index diff.** That is intended (it is what makes drift visible), but
  it will surface as merge conflicts on the index whenever two artefact PRs are
  open. The index format should be line-stable so a conflict is resolvable by
  regenerating rather than by hand.

---

## Open questions

| ID | Question | My proposed default | Blocks |
| --- | --- | --- | --- |
| Q1 | The exact `settings.json` key names and value shapes for preconfiguring marketplaces and enabled plugins (believed `extraKnownMarketplaces` / `enabledPlugins`), and whether a marketplace `renames` map exists and what it is called | **Verify against the official Claude Code docs before implementing, and pin the verified shape in the plan.** The bundle builder must emit a block that Claude Code actually accepts — A20 is written to catch a wrong guess, but a wrong guess costs a release | R20 · C13 |
| Q2 | The exact Claude Code versions that introduced `archive` and `command` plugin sources (believed 2.1.224+ and 2.1.229+) | **Ship the min-version filter (R17) with the two believed numbers behind a single constants file that cites its source**, so a correction is one edit and not a hunt | R17 |
| Q3 | How a hook declares a description (R21): a leading `// @description:` comment convention, a sibling `hook.json`, or a `description` field in `.claude/settings.json` next to the matcher | **A sibling `hook.json` per hook.** It is data rather than a parsed comment, it survives a refactor of the script, and it does not require `.claude/settings.json` to carry documentation | R21 · C6 |
| Q4 | The repository is not yet confirmed public. Both GitHub Pages and `/plugin marketplace add owner/repo` require it | **Treat "make the repo public" as a precondition on the release, decided by the CTO, not by this spec.** Nothing in the site works privately | R10 |
| Q5 | OG image generation (R26) under a fully static export — pre-render PNGs in the generator, or use the framework's image response at build time | **Pre-render PNGs in the generator step.** It keeps the OG path inside the one deterministic thing R1 and R2 already gate, and it cannot depend on a runtime that a static host does not have | R26 |
| Q6 | Runtime analytics via an external service (GoatCounter / Plausible) | **Ship v1 with none.** R12 says no third-party origin at runtime, and the R18 issue prefill already captures the only signal that changes a decision — the queries that found nothing. Adding analytics later is one script tag; removing a privacy commitment is not | R12 · nothing |
| Q7 | Whether the site's chrome is ever translated, given the CTO searches in Ukrainian | **English chrome, any-script search input (R27).** Translating chrome does not answer the question the Ukrainian query is asking; the alias table does | R27 · nothing |
| Q8 | Which plugins the marketplace actually ships — one bundle of everything, or a plugin per concern (skills / agents / mcp) | **A plugin per concern.** The "owning plugin" facet (R7, R17) is only useful if more than one exists, and a single mega-plugin makes every filter degenerate | R7 · R17 |

---

## Could not establish

- **The MiniSearch API surface and its Cyrillic behaviour.** A research task on
  the exact serialization API, the boost/fuzzy/prefix option names, the default
  tokenizer and term-processing behaviour for non-Latin scripts, and the
  serialized-size ratio was dispatched and had not reported when this file was
  written. R5, R13 and R27 therefore state the **behaviour required** and not the
  option names; C1 states the invariant (index and query normalized identically)
  that the implementer must satisfy however the library expresses it. Confirm
  before writing the plan.
- **Q1 and Q2 in full** — the marketplace and `plugin.json` schema, the settings
  key names, and the two version numbers. Taken from the brief, not verified
  against the official documentation here.
- **Whether the repository is public** (Q4). `.git/config:9` gives the remote;
  visibility is not readable from the working tree.
- **The real size of a generated index.** No generator exists yet, so the 300 KB
  budget in R13 is set from the corpus size (~22 artefacts, largest body ~50 KB)
  and a first-load target, not from a measurement. A13 is the criterion that
  turns it into one.
- **Whether `client/src/vendor/ui` compiles cleanly outside `client/`.** The
  barrel and the alias are read (`index.ts:4-13`, `README.md:1`), but no second
  package consumes it today, and root `INSIGHTS.md` records that path-aliased
  vendored sources have bitten emit before. R15 assumes it works; the plan should
  prove it in its first phase.
