# Marketplace research — how to publish this repo as a Claude Code plugin marketplace

**Status:** temporary. **Delete when:** `.claude-plugin/marketplace.json` exists,
the first plugin under `plugins/` is published, and anything below that is still
true has been moved into `docs/`, a spec, or `INSIGHTS.md`.

Gathered 2026-08-29 from the official Claude Code documentation and from
community write-ups, plus checks run against this repository. Claims sourced
from the official docs are marked **[docs]**; claims verified by running
something here are marked **[verified]**; everything else is community opinion
and should be treated as a hint, not a rule.

---

## 1. What a marketplace actually is

A marketplace is a git repository containing one catalog file. There is no
registry, no npm package, and no hosting to arrange. **[docs]**

Minimum layout:

```
your-marketplace/
├── .claude-plugin/
│   └── marketplace.json          # the only required file
├── plugins/
│   └── <plugin-name>/
│       ├── .claude-plugin/plugin.json   # required per plugin
│       ├── skills/<name>/SKILL.md
│       ├── agents/*.md
│       ├── commands/*.md
│       ├── hooks/hooks.json
│       ├── .mcp.json
│       ├── .lsp.json
│       ├── output-styles/
│       └── themes/
└── README.md
```

Users install with two commands: **[docs]**

```
/plugin marketplace add owner/repo
/plugin install <plugin-name>@<marketplace-name>
```

## 2. `marketplace.json`

```json
{
  "name": "devdigest-tools",
  "owner": { "name": "Alex Lavrenin", "email": "…", "url": "…" },
  "plugins": [
    {
      "name": "api-contract-reviewer",
      "source": "./plugins/api-contract-reviewer",
      "description": "…",
      "version": "1.0.0",
      "category": "development",
      "tags": ["review", "zod"],
      "author": { "name": "…" },
      "strict": true
    }
  ],
  "renames": { "old-plugin-name": "new-name", "withdrawn-plugin": null }
}
```

Required: `name` (kebab-case), `owner.name`, a non-empty `plugins` array, and
per entry a `name` and a `source`. A marketplace entry accepts every field a
`plugin.json` accepts, all optional, plus the marketplace-only fields `source`,
`strict`, `category` and `tags`. **[docs]**

A set of marketplace names is reserved (`claude-code-marketplace`,
`anthropic-plugins`, `claude-for-legal`, …) and cannot be used. **[docs]**

### `plugin.json`

Only `name` is required. The rest are metadata and path overrides:
`displayName`, `version`, `skills`, `agents`, `hooks`, `mcpServers`,
`lspServers`, `userConfig`. **[docs]**

### Source types

| Source | Shape | Use for |
| --- | --- | --- |
| Relative path | `"./plugins/x"` | plugins living in this repo |
| GitHub | `{"source":"github","repo":"owner/repo"}` | another GitHub repo |
| Git URL | `{"source":"url","url":"https://gitlab…"}` | any git host |
| npm | `{"source":"npm","package":"@org/x"}` | published npm packages |
| Archive | `{"source":"archive","url":"https://….zip"}` | requires Claude Code **2.1.224+** |
| Command | `{"source":"command","command":"my-tool"}` | requires Claude Code **2.1.229+** |

**[docs]** The two version numbers are the reason `specs/16` needs a
minimum-version facet; keep them in one constants file that cites this document
so a correction is one edit.

## 3. Traps that cost real time

1. **Relative paths only resolve when the marketplace is added via git.** Serve
   `marketplace.json` from a plain static URL and `./plugins/x` silently fails
   to resolve. Either use git, or use absolute sources — not a mix.
2. **A plugin is cached by copying its own directory.** Nothing inside a plugin
   may reference `../shared-utils`. Shared code is duplicated or pulled in as an
   npm source.
3. **Paths inside a plugin go through `${CLAUDE_PLUGIN_ROOT}`** (hooks, MCP
   commands). State that survives updates goes in `${CLAUDE_PLUGIN_DATA}`.
4. **`strict` defaults to true**, meaning `plugin.json` is the authority for
   component definitions. `strict: false` lets the marketplace entry override
   it — do not turn it off without a reason.
5. **Marketplace source and plugin source are independent.** One catalog can
   point at several repos, each pinned to its own branch or tag. This is the
   mechanism behind release channels: two marketplaces on two refs, assigned to
   different groups through managed settings.
6. **Renaming a plugin breaks existing installs** unless the `renames` map
   carries the old name. `null` as a value means withdrawn.
7. **Enterprise distribution is narrower than the general case:** org settings
   allow only `github`, `url`, `git-subdir` or relative sources, private plugins
   must sit in the marketplace repo or under the same owner, and admins can pin
   the allowed set with `strictKnownMarketplaces`.

## 4. Preconfiguring a team

In `.claude/settings.json`, so nobody installs anything by hand: **[docs]**

```json
{
  "extraKnownMarketplaces": {
    "devdigest-tools": { "source": { "source": "github", "repo": "AIengineerDev/dev-digest" } }
  },
  "enabledPlugins": { "api-contract-reviewer@devdigest-tools": true }
}
```

This is the exact block the catalog site's bundle builder has to emit
(`specs/16`, R20) — it must be checked against the docs again at implementation
time, because a wrong key shape costs a release.

## 5. Validation and release

```
claude plugin validate .          # schema check, official
node scripts/marketplace-verify.mjs   # cross-file agreement, ours
```

`claude plugin validate .` checks the schema. It cannot check the things that
actually break a release: a `name` that drifted away from `plugin.json`, a
version that disagrees across two files, a relative source that stopped
resolving, or a `renames` entry pointing at a plugin that does not exist. That
is what `scripts/marketplace-verify.mjs` covers, and what
`.github/workflows/marketplace.yml` runs on every PR touching `.claude-plugin/`
or `plugins/`.

Release and rollback are `scripts/release.sh` and `scripts/rollback.sh`. The
constraint that shapes both is recorded in the root `INSIGHTS.md` under
*Decisions, 2026-08-29* and is not repeated here.

## 6. Checks run against this repository

- **[verified]** The repo is public: `AIengineerDev/dev-digest`,
  `visibility: PUBLIC` (via `gh repo view`). Both GitHub Pages and
  `/plugin marketplace add owner/repo` require this.
- **[verified]** No `SKILL.md` and no agent file contains non-Latin text — every
  routable description is already English. Four companion files are Ukrainian
  (`.claude/skills/pr-self-review/PLAN.md`,
  `.claude/skills/onion-architecture/PLAN.md` and `README.md`,
  `.claude/skills/dependency-checker/README.md`) and are internal notes, not
  descriptions. Open decision: exclude them from the public index, or translate.
- **[verified]** Three directories look like skills and are not:
  `.claude/skills/pr-self-review/` (only `PLAN.md`),
  `.claude/skills/react-component-quality/` (only `README.md`), and
  `skills/api-contract-reviewer/` (product data, no `SKILL.md`, handled
  separately by `checkProductSkills` in `evals/src/quality.ts`). Publishing them
  would ship three unusable artefacts.
- **[verified]** Real artefact counts today: 7 skills, 8 agents, 1 hook,
  5 MCP tools, 1 product skill.

## 7. Community practice — weaker evidence, useful anyway

- Version bumps driven by conventional commits, with CI syncing the versions in
  `plugin.json` and `marketplace.json`. Template:
  <https://github.com/Nagell/claude-marketplace-template>
- One plugin per coherent concern rather than a single bucket: users enable and
  disable a plugin as a unit, and every catalog filter degenerates when only one
  plugin exists.
- `claude plugin validate .` in CI on every PR is the cheapest gate available
  and the only one most marketplaces have.

## Sources

- <https://code.claude.com/docs/en/plugin-marketplaces>
- <https://code.claude.com/docs/en/plugins-reference>
- <https://github.com/anthropics/claude-code/blob/main/.claude-plugin/marketplace.json>
- <https://dev.to/nagell/build-your-own-claude-code-marketplace-scaffold-structure-and-auto-updates-4n3f>
- <https://ice-ice-bear.github.io/posts/2026-04-03-claude-code-plugin-marketplace/>
- <https://dev.classmethod.jp/en/articles/claude-code-marketplace-source-external-repo/>
