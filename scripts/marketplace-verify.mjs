#!/usr/bin/env node
//
// Marketplace integrity gate.
//
//   node scripts/marketplace-verify.mjs          # verify, exit 1 on any error
//   node scripts/marketplace-verify.mjs --strict # warnings become errors too
//
// This is the only thing standing between a typo and every user of the
// marketplace, because plugin manifests have no type checker and no test suite
// of their own: a broken `source`, a name that drifted from plugin.json, or a
// version that says 1.2.0 in one file and 1.1.0 in the other all fail silently
// at install time, in someone else's session.
//
// Run by CI on every PR that touches `.claude-plugin/` or `plugins/`, and by
// scripts/release.sh before it is willing to tag anything.
//
// Deliberately NOT a replacement for `claude plugin validate .` — that checks
// the schema, this checks the things the schema cannot know: cross-file
// agreement, reachability of relative sources, and rename bookkeeping. If the
// `claude` CLI is on PATH we run it too and fold its result in.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, '.claude-plugin', 'marketplace.json')
const STRICT = process.argv.includes('--strict')

// Names Anthropic reserves; a marketplace using one cannot be added by users.
const RESERVED = new Set([
  'claude-code-marketplace',
  'anthropic-plugins',
  'claude-for-legal',
  'claude-plugins',
  'anthropic',
])

const errors = []
const warnings = []
const err = (m) => errors.push(m)
const warn = (m) => warnings.push(m)

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    err(`${label}: cannot parse — ${e.message}`)
    return null
  }
}

// ── 0. The manifest has to exist at all ──────────────────────────────────────
if (!existsSync(MANIFEST)) {
  console.error(
    'No .claude-plugin/marketplace.json — this repository is not a marketplace yet.\n' +
      'Nothing to verify. Create the manifest first; this gate is inert until then.',
  )
  process.exit(0)
}

const mk = readJson(MANIFEST, 'marketplace.json')
if (!mk) finish()

// ── 1. Marketplace-level fields ──────────────────────────────────────────────
if (!mk.name) err('marketplace.json: `name` is required')
else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(mk.name))
  err(`marketplace.json: \`name\` must be kebab-case, got "${mk.name}"`)
else if (RESERVED.has(mk.name))
  err(`marketplace.json: "${mk.name}" is a reserved marketplace name; users cannot add it`)

if (!mk.owner || typeof mk.owner !== 'object') err('marketplace.json: `owner` object is required')
else if (!mk.owner.name) err('marketplace.json: `owner.name` is required')

if (!Array.isArray(mk.plugins) || mk.plugins.length === 0)
  err('marketplace.json: `plugins` must be a non-empty array')

// ── 2. Each plugin entry ─────────────────────────────────────────────────────
const seen = new Map()
const liveNames = new Set()

for (const [i, p] of (mk.plugins ?? []).entries()) {
  const at = `plugins[${i}]${p?.name ? ` (${p.name})` : ''}`

  if (!p?.name) { err(`${at}: \`name\` is required`); continue }
  if (!p.source) err(`${at}: \`source\` is required`)

  if (seen.has(p.name)) err(`${at}: duplicate plugin name, first seen at plugins[${seen.get(p.name)}]`)
  seen.set(p.name, i)
  liveNames.add(p.name)

  if (!p.description) warn(`${at}: no \`description\` — this is the text users search on`)

  // Relative sources are the only ones we can check locally. They are also the
  // ones that silently fail when the marketplace is served from a plain URL
  // instead of git, so flag that trade-off once, here, where it is visible.
  if (typeof p.source === 'string' && p.source.startsWith('.')) {
    const dir = join(ROOT, p.source)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      err(`${at}: source "${p.source}" does not resolve to a directory`)
      continue
    }

    const pj = join(dir, '.claude-plugin', 'plugin.json')
    if (!existsSync(pj)) { err(`${at}: no .claude-plugin/plugin.json under "${p.source}"`); continue }

    const plugin = readJson(pj, `${p.source}/.claude-plugin/plugin.json`)
    if (!plugin) continue

    if (plugin.name && plugin.name !== p.name)
      err(`${at}: name disagrees with plugin.json ("${p.name}" vs "${plugin.name}")`)

    if (p.version && plugin.version && p.version !== plugin.version)
      err(`${at}: version drift — marketplace says ${p.version}, plugin.json says ${plugin.version}`)

    if (!plugin.version) warn(`${at}: plugin.json has no \`version\`; rollback cannot name a target`)

    // A plugin that ships no components is almost always a wiring mistake.
    const dirs = ['skills', 'agents', 'commands', 'hooks'].filter((d) => existsSync(join(dir, d)))
    const files = ['.mcp.json', '.lsp.json'].filter((f) => existsSync(join(dir, f)))
    if (dirs.length === 0 && files.length === 0)
      warn(`${at}: no skills/, agents/, commands/, hooks/, .mcp.json or .lsp.json — ships nothing`)

    // Eval coverage. Not a hard failure: the repo's own convention is that a
    // skill without cases keeps a warning forever rather than blocking.
    const skillsDir = join(dir, 'skills')
    if (existsSync(skillsDir)) {
      for (const s of readdirSync(skillsDir)) {
        const hasCases =
          existsSync(join(skillsDir, s, 'evals')) ||
          existsSync(join(ROOT, 'evals', 'skills', s)) ||
          existsSync(join(ROOT, 'skills', s, 'evals'))
        if (!hasCases) warn(`${at}: skill "${s}" has no eval cases`)
      }
    }
  } else if (typeof p.source === 'object' && p.source !== null) {
    const kind = p.source.source
    if (!kind) err(`${at}: object \`source\` needs a \`source\` discriminator`)
    // An external source pinned to nothing tracks that repo's default branch,
    // which means its releases are not ours to roll back.
    if (kind === 'github' && !p.source.ref)
      warn(`${at}: github source has no \`ref\` — it tracks the upstream default branch and cannot be rolled back from here`)
  }
}

// ── 3. Renames ───────────────────────────────────────────────────────────────
for (const [from, to] of Object.entries(mk.renames ?? {})) {
  if (liveNames.has(from))
    err(`renames: "${from}" is still a live plugin name; a rename must point away from a name that no longer exists`)
  if (to !== null && !liveNames.has(to))
    err(`renames: "${from}" -> "${to}", but "${to}" is not a plugin in this marketplace`)
}

// ── 4. Fold in the official validator when it is available ───────────────────
try {
  execFileSync('claude', ['plugin', 'validate', '.'], { cwd: ROOT, stdio: 'pipe' })
} catch (e) {
  if (e.code === 'ENOENT') warn('`claude` CLI not on PATH — skipped `claude plugin validate .`')
  else err(`claude plugin validate .\n${(e.stdout || e.stderr || '').toString().trim()}`)
}

finish()

function finish() {
  for (const w of warnings) console.warn(`warn  ${w}`)
  for (const e of errors) console.error(`ERROR ${e}`)

  if (errors.length === 0 && (warnings.length === 0 || !STRICT)) {
    console.log(`\nmarketplace ok — ${seen.size} plugin(s), ${warnings.length} warning(s)`)
    process.exit(0)
  }
  console.error(`\nFAILED — ${errors.length} error(s), ${warnings.length} warning(s)${STRICT ? ' (--strict)' : ''}`)
  process.exit(1)
}
