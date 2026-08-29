# `prototype/` — design prototype for the catalog site

A single self-contained `index.html`. No build step, no dependencies, no package
manager. Open it directly or serve the folder; it also deploys to GitHub Pages at
`/prototype/` (see `.github/workflows/pages.yml`).

## What it is

The interactive prototype for `specs/16-marketplace-catalog-site.md` — the design
that specification gets implemented from. It demonstrates:

- lexical search with unicode-aware tokenization, prefix and single-edit fuzzy
  matching, and a committed alias table including Ukrainian phrasings (R5, R6, R27)
- all four search states — browse-all, results, zero results, filters-exclude-all —
  each designed separately, because the last two have different remedies (R28)
- result cards with type, version, owning plugin, eval badge, extracted trigger
  phrases and the source path the fields came from (R7, R19, R24)
- artefact detail with frontmatter, verbatim description, body, inline boundary
  pair, cited relationships and a changelog (R9, R23, R25)
- the relationship graph, drawn only from cross-references that carry a
  `path:line` citation (R22)
- the bundle builder, producing a pasteable `.claude/settings.json` block (R20)
- dark-first theming with a light option, resolving correctly in all three
  viewer states (system, explicit dark, explicit light)

## Running it locally

```bash
node prototype/dev.mjs                     # http://localhost:4300/prototype/
node prototype/dev.mjs --port 5000
node prototype/dev.mjs --base /dev-digest  # rehearse the deployed subpath
node prototype/dev.mjs --no-reload         # serve byte-for-byte what deploys
```

Node standard library only — no install, no lockfile, no package manager. Edits
to `index.html` reload the open page; nothing needs restarting.

The server and the `pages` workflow both call `scripts/build-pages.mjs`, so the
layout you browse locally is the layout that ships. `--base` matters more than it
looks: the deployed site lives under `/dev-digest/`, and a link that resolves at
the root can still 404 one directory down. That is the usual way a Pages deploy
fails after a green build.

To produce the deployable output without serving it:

```bash
node scripts/build-pages.mjs        # writes ./_site (gitignored)
node scripts/build-catalog.mjs --report   # what the generator reads, and what it could not answer
```

## What it is not

**Not the site.** `specs/16` specifies `site/` as a separate pnpm Next.js package
with a build-time index generator and per-artefact static pages. This folder is
deliberately outside that: it is a design surface, and it is kept apart from the
marketplace's own structure (`.claude-plugin/`, `plugins/`) so the two never mix.

**Wired to the repository, not to a copy of it.** The page ships with no artefact
data at all. `scripts/build-catalog.mjs` reads `.claude/skills/`, `.claude/agents/`,
`.claude/hooks/`, `mcp/src/tools/` and `skills/` and emits `catalog.json`, which the
page fetches at load. It is regenerated on every request in dev and on every deploy
in CI, so there is no committed copy that can drift — and therefore nothing for a
staleness gate to catch.

What it will not do is invent. There is no `.claude-plugin/marketplace.json` in this
repository yet, so no artefact belongs to a plugin and no install command exists. The
catalog reports that state explicitly: the plugin facet explains itself, install
buttons are disabled with the reason, and the bundle builder says what is missing.
The moment a marketplace manifest lands, those surfaces fill in on their own with no
edit to this page.

Anything the sources cannot answer becomes a diagnostic, shown in the catalog rather
than hidden: a directory under `.claude/skills/` with no `SKILL.md` is not a skill and
is left out; a hook with no declared description gets one derived from its comment
block and is labelled as derived.

The generator declares a minimum count per class. If a source directory moves or
empties, the build fails naming the class — it never quietly ships a smaller catalog.

## Base path

Nothing in the page is a relative URL: fonts come from Google Fonts, the favicon
is a data URI, and repository links are absolute. It therefore works unchanged at
`/`, at `/dev-digest/prototype/`, or from `file://`. Navigation state lives in the
URL hash, so a filtered search and a selected bundle are both linkable wherever it
is hosted.
