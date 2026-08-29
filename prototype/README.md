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
```

## What it is not

**Not the site.** `specs/16` specifies `site/` as a separate pnpm Next.js package
with a build-time index generator and per-artefact static pages. This folder is
deliberately outside that: it is a design surface, and it is kept apart from the
marketplace's own structure (`.claude-plugin/`, `plugins/`) so the two never mix.

**Not wired to the repository.** The artefact data is a literal at the top of the
script. Every name, description, version, model, tool list, source path and eval
coverage flag in it was read from this repository and is accurate as of
2026-08-29 — but nothing re-reads it. In the real site that object is the
generator's output and is never hand-authored (R1, R3). When an artefact changes
here, this prototype goes stale silently. That is acceptable for a prototype and
is exactly the failure the R2 staleness gate exists to prevent in `site/`.

## Base path

Nothing in the page is a relative URL: fonts come from Google Fonts, the favicon
is a data URI, and repository links are absolute. It therefore works unchanged at
`/`, at `/dev-digest/prototype/`, or from `file://`. Navigation state lives in the
URL hash, so a filtered search and a selected bundle are both linkable wherever it
is hosted.
