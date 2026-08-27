#!/usr/bin/env node
// Measures a Claude Code session from its transcript. Deterministic: every
// number printed is read from the JSONL, never inferred. What cannot be read is
// reported as unavailable rather than estimated.
//
//   node measure.mjs                 # newest transcript for this project
//   node measure.mjs --session <id>  # one session by id (or path)
//   node measure.mjs --all           # every transcript in the project
//   node measure.mjs --json          # raw numbers instead of markdown
//
// Limitation that shapes the whole design: a subagent's own turns are NOT in
// the parent transcript (no `isSidechain` records exist). Per-subagent totals
// come from the `<usage>` block the harness attaches to a finished agent, so we
// know a subagent's cost and tool count but not what it read.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, basename, isAbsolute } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const projectDir = join(
  homedir(), '.claude', 'projects',
  process.cwd().replace(/\//g, '-'),
)
if (!existsSync(projectDir)) {
  console.error(`No transcripts for this project.\nLooked in: ${projectDir}`)
  process.exit(1)
}

function pickFiles() {
  const all = readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'))
    .map((f) => join(projectDir, f))
  if (flag('--all')) return all.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
  const s = opt('--session')
  if (s) {
    const p = isAbsolute(s) ? s : join(projectDir, s.endsWith('.jsonl') ? s : `${s}.jsonl`)
    if (!existsSync(p)) { console.error(`No such transcript: ${p}`); process.exit(1) }
    return [p]
  }
  return [all.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]]
}

const files = pickFiles()
const num = (n) => (n ?? 0).toLocaleString('en-US')

const main = { in: 0, out: 0, cacheCreate: 0, cacheRead: 0, turns: 0, models: {} }
const tools = new Map()
const spawns = []          // { at, type, model, background, desc }
const agentUsage = []      // { tokens, toolUses, ms }
const skills = new Map()
const questions = []       // AskUserQuestion timestamps — each is a stop-and-ask
const seenUsage = new Set()
let first = null, last = null

// A finished agent reports its cost in one of two shapes: background agents
// arrive as a task-notification using XML tags, foreground ones as a plain
// tool result using `key: value` lines. Both are matched; missing one silently
// halves the reported agent cost.
const USAGE_TAGS = /<subagent_tokens>(\d+)<\/subagent_tokens>\s*<tool_uses>(\d+)<\/tool_uses>\s*<duration_ms>(\d+)<\/duration_ms>/g
const USAGE_LINES = /subagent_tokens:\s*(\d+)\\n\s*tool_uses:\s*(\d+)\\n\s*duration_ms:\s*(\d+)/g

for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let o; try { o = JSON.parse(line) } catch { continue }

    const ts = o.timestamp
    if (ts) { if (!first || ts < first) first = ts; if (!last || ts > last) last = ts }

    // Subagent totals arrive inside task-notification text anywhere in the log.
    // Only `user` records carry a real agent result; `queue-operation` rows
    // relay other sessions' notifications and must not be attributed here.
    // A block is also re-emitted on later lines, so identical
    // (tokens, tool_uses, duration_ms) triples are collapsed — millisecond
    // precision makes a genuine collision implausible, and collapsing is the
    // safe direction: this script's own output can end up in the transcript it
    // will read next time.
    if (o.type === 'user') {
      for (const re of [USAGE_TAGS, USAGE_LINES]) {
        for (const m of line.matchAll(re)) {
          const key = `${m[1]}/${m[2]}/${m[3]}`
          if (seenUsage.has(key)) continue
          seenUsage.add(key)
          agentUsage.push({ tokens: +m[1], toolUses: +m[2], ms: +m[3] })
        }
      }
    }

    if (o.type !== 'assistant') continue
    const msg = o.message || {}
    main.turns++
    if (msg.model) main.models[msg.model] = (main.models[msg.model] || 0) + 1
    const u = msg.usage || {}
    main.in += u.input_tokens || 0
    main.out += u.output_tokens || 0
    main.cacheCreate += u.cache_creation_input_tokens || 0
    main.cacheRead += u.cache_read_input_tokens || 0

    for (const c of msg.content || []) {
      if (!c || c.type !== 'tool_use') continue
      tools.set(c.name, (tools.get(c.name) || 0) + 1)
      const i = c.input || {}
      if (c.name === 'Agent' || c.name === 'Task') {
        spawns.push({
          at: ts, type: i.subagent_type || '(default)',
          model: i.model || 'inherit',
          background: i.run_in_background !== false,
          desc: (i.description || '').slice(0, 40),
        })
      }
      if (c.name === 'Skill') skills.set(i.skill, (skills.get(i.skill) || 0) + 1)
      if (c.name === 'AskUserQuestion') questions.push(ts)
    }
  }
}

spawns.sort((a, b) => String(a.at).localeCompare(String(b.at)))

// Two spawns inside this window were almost certainly issued in one message,
// i.e. a real fan-out. Serialised spawns of parallelisable work show up as gaps.
const FANOUT_WINDOW_MS = 60_000
const waves = []
for (const s of spawns) {
  const w = waves[waves.length - 1]
  if (w && new Date(s.at) - new Date(w[w.length - 1].at) <= FANOUT_WINDOW_MS) w.push(s)
  else waves.push([s])
}

const byType = {}
for (const s of spawns) byType[s.type] = (byType[s.type] || 0) + 1

const agentTotal = agentUsage.reduce((a, b) => a + b.tokens, 0)
const cacheRatio = main.cacheCreate ? main.cacheRead / main.cacheCreate : null

if (flag('--json')) {
  console.log(JSON.stringify({ files: files.map((f) => basename(f)), first, last, main, tools: Object.fromEntries(tools), spawns, waves: waves.map(w => w.length), agentUsage, agentTotal, skills: Object.fromEntries(skills), questions: questions.length }, null, 2))
  process.exit(0)
}

const L = []
L.push(`## Measured`)
L.push(``)
L.push(`Transcript${files.length > 1 ? 's' : ''}: ${files.map((f) => basename(f)).join(', ')}`)
L.push(`Window: ${first || '?'} → ${last || '?'}`)
L.push(``)
L.push(`### Tokens`)
L.push(``)
L.push(`| | Tokens |`)
L.push(`| --- | --- |`)
L.push(`| Main session output | ${num(main.out)} |`)
L.push(`| Main session input (uncached) | ${num(main.in)} |`)
L.push(`| Cache created | ${num(main.cacheCreate)} |`)
L.push(`| Cache read | ${num(main.cacheRead)} |`)
L.push(`| **Subagents, total** | **${num(agentTotal)}** across ${agentUsage.length} finished agent${agentUsage.length === 1 ? '' : 's'} |`)
L.push(``)
if (cacheRatio !== null) {
  L.push(`Cache read : created = **${cacheRatio.toFixed(1)}:1**. A low ratio means the`)
  L.push(`context was rebuilt rather than reused — usually many small edits to files`)
  L.push(`already in context, or a long tail of one-off reads.`)
  L.push(``)
}
if (agentUsage.length !== spawns.length) {
  L.push(`> ${spawns.length} spawn${spawns.length === 1 ? '' : 's'} recorded but ${agentUsage.length} usage block${agentUsage.length === 1 ? '' : 's'} — the two lists are reported`)
  L.push(`> separately because the transcript does not link them. Agents that were`)
  L.push(`> stopped, or whose notification is not in this file, have no usage row.`)
  L.push(``)
}
L.push(`### Agents`)
L.push(``)
if (!spawns.length) L.push(`No subagents were spawned.`)
else {
  L.push(`${spawns.length} spawned, in ${waves.length} wave${waves.length === 1 ? '' : 's'} (a wave = spawns within ${FANOUT_WINDOW_MS / 1000}s of each other):`)
  L.push(``)
  L.push(`| # | Agent | Model | Mode | At |`)
  L.push(`| --- | --- | --- | --- | --- |`)
  spawns.forEach((s, i) => L.push(`| ${i + 1} | \`${s.type}\` | ${s.model} | ${s.background ? 'background' : 'foreground'} | ${String(s.at).slice(5, 16).replace("T", " ")} |`))
  L.push(``)
  L.push(`By type: ${Object.entries(byType).map(([k, v]) => `\`${k}\` ×${v}`).join(' · ')}`)
  L.push(``)
  const single = waves.filter((w) => w.length === 1).length
  L.push(`Waves: ${waves.map((w) => w.length).join(' → ')}${single === waves.length && spawns.length > 1 ? '  — every spawn was on its own; nothing ran concurrently' : ''}`)
  L.push(``)
  if (agentUsage.length) {
    L.push(`| Agent run | Tokens | Tool uses | Duration |`)
    L.push(`| --- | --- | --- | --- |`)
    agentUsage.forEach((a, i) => L.push(`| ${i + 1} | ${num(a.tokens)} | ${a.toolUses} | ${(a.ms / 1000).toFixed(0)}s |`))
    L.push(``)
  }
}
L.push(`### Main-session tools`)
L.push(``)
L.push([...tools.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(' · ') || 'none')
L.push(``)
if (skills.size) { L.push(`Skills invoked: ${[...skills.entries()].map(([k, v]) => `\`${k}\` ×${v}`).join(' · ')}`); L.push(``) }
L.push(`Stops to ask the human: **${questions.length}**`)
L.push(``)
L.push(`### Not measurable from the transcript`)
L.push(``)
L.push(`- **What each subagent read.** Subagent turns are not recorded here, so file`)
L.push(`  overlap between agents can only come from their own reports.`)
L.push(`- **Model actually used by a subagent** when the spawn says \`inherit\`.`)
L.push(`- **Dollar cost.** No price table is applied; token counts only.`)

console.log(L.join('\n'))
