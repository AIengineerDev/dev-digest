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

import { readFileSync, existsSync, readdirSync, statSync, realpathSync, readlinkSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, '.claude-plugin', 'marketplace.json')
const rel = (p) => relative(ROOT, p).split('\\').join('/')
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

// ── 2b. Symlinks: a plugin here is packaging, so every body must resolve ─────
// The plugin directories hold links into the live artefacts rather than copies.
// A dangling link ships an empty plugin; a link that escapes the repository
// ships nothing at all, because install only dereferences targets inside the
// marketplace.
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isSymbolicLink()) out.push(full)
    else if (e.isDirectory()) walk(full, out)
  }
  return out
}

if (existsSync(join(ROOT, 'plugins'))) {
  for (const link of walk(join(ROOT, 'plugins'))) {
    const where = rel(link)
    if (!existsSync(link)) { err(`${where}: dangling symlink -> ${readlinkSafe(link)}`); continue }
    const target = realpathSync(link)
    if (!target.startsWith(realpathSync(ROOT) + '/'))
      err(`${where}: symlink escapes the repository -> ${target}. Install only dereferences targets inside the marketplace.`)
  }
}

// ── 2c. No shipped artefact may address another by repository path ──────────
// An installed plugin is a copy of its own directory and cannot read outside
// it, so a path rooted at the repository resolves to nothing on a user's
// machine — silently, at the moment the artefact runs.
const REPO_ROOTED = /(?<![\w$"'`/-])\.claude\/(skills|agents|hooks)\//
function scanForRepoPaths(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory() || (e.isSymbolicLink() && existsSync(full) && statSync(full).isDirectory())) {
      scanForRepoPaths(full)
    } else if (/\.(md|mjs|js|sh|json)$/.test(e.name)) {
      // A dangling link is already reported above; reading it here would throw
      // and kill the run before any error is printed.
      if (!existsSync(full)) continue
      const text = readFileSync(full, 'utf8')
      text.split('\n').forEach((line, i) => {
        if (REPO_ROOTED.test(line))
          err(`${rel(full)}:${i + 1}: addresses another artefact by repository path. Use \`$\{CLAUDE_PLUGIN_ROOT}\` for a sibling file, or invoke the skill by name.`)
      })
    }
  }
}
if (existsSync(join(ROOT, 'plugins'))) scanForRepoPaths(join(ROOT, 'plugins'))

// ── 2d. Dependencies ────────────────────────────────────────────────────────
// Claude Code resolves these transitively at install. A name that is not in this
// marketplace, or a range no released version satisfies, fails on the user's
// machine rather than here — unless this gate catches it first.
const versions = new Map()
for (const p of mk.plugins ?? []) if (p.name) versions.set(p.name, p.version ?? null)

function satisfies(version, range) {
  if (!version) return false
  const v = version.split('.').map(Number)
  const m = String(range).trim().match(/^([~^]|>=|=)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/)
  if (!m) return null                                   // not a form we check
  const [, op, MA, MI, PA] = m
  const r = [Number(MA), Number(MI ?? 0), Number(PA ?? 0)]
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  if (op === '^') return v[0] === r[0] && cmp(v, r) >= 0
  if (op === '~') return v[0] === r[0] && v[1] === r[1] && cmp(v, r) >= 0
  if (op === '>=') return cmp(v, r) >= 0
  return cmp(v, r) === 0
}

const graph = new Map()
for (const entry of mk.plugins ?? []) {
  if (typeof entry.source !== 'string' || !entry.source.startsWith('.')) continue
  const pj = join(ROOT, entry.source, '.claude-plugin', 'plugin.json')
  if (!existsSync(pj)) continue
  const plugin = readJson(pj, rel(pj))
  if (!plugin) continue
  const deps = (plugin.dependencies ?? []).map((d) => (typeof d === 'string' ? { name: d } : d))
  graph.set(entry.name, deps.map((d) => d.name))

  for (const d of deps) {
    const at = `${entry.name} -> ${d.name}`
    if (d.marketplace) {
      if (!(mk.allowCrossMarketplaceDependenciesOn ?? []).includes(d.marketplace))
        err(`${at}: cross-marketplace dependency on "${d.marketplace}", but marketplace.json does not list it in allowCrossMarketplaceDependenciesOn`)
      continue
    }
    if (!versions.has(d.name)) { err(`${at}: no plugin named "${d.name}" in this marketplace`); continue }
    if (d.name === entry.name) { err(`${at}: a plugin cannot depend on itself`); continue }
    if (d.version) {
      const ok = satisfies(versions.get(d.name), d.version)
      if (ok === false)
        err(`${at}: current version ${versions.get(d.name)} does not satisfy "${d.version}"`)
      else if (ok === null)
        warn(`${at}: range "${d.version}" is not a form this gate checks — Claude Code still enforces it`)
    } else {
      warn(`${at}: unversioned dependency tracks whatever the marketplace provides; a breaking upstream release lands with no warning`)
    }
  }
}

// A cycle deadlocks resolution; find one before a user does.
;(function cycles() {
  const state = new Map()
  const stack = []
  const visit = (n) => {
    if (state.get(n) === 'done') return
    if (state.get(n) === 'open') {
      err(`dependency cycle: ${[...stack.slice(stack.indexOf(n)), n].join(' -> ')}`)
      return
    }
    state.set(n, 'open'); stack.push(n)
    for (const d of graph.get(n) ?? []) if (graph.has(d)) visit(d)
    stack.pop(); state.set(n, 'done')
  }
  for (const n of graph.keys()) visit(n)
})()

function readlinkSafe(p) { try { return readlinkSync(p) } catch { return '?' } }

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
