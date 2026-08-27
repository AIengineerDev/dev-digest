#!/usr/bin/env node
// PreToolUse guard for the `spec-creator` subagent.
//
// Specreator writes specifications and nothing else. This hook is the
// enforcement — the prompt states the rule, this file makes it true even when
// the prompt is ignored, drifts, or is overridden by a task instruction.
//
// It is a no-op for every other agent and for the main session: `implementer`,
// `test-writer` and `doc-writer` keep their full write access.
//
// Wired from .claude/settings.json on PreToolUse / Write|Edit|MultiEdit|NotebookEdit|Bash.
//
// Bash is covered because a file-tool fence that ignores the shell is not a
// fence: `echo ... > server/src/x.ts` walks straight past a Write-only matcher.

import { existsSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'

const ALLOW = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } }

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}

function pass() {
  // Silence, exit 0 — the normal permission flow continues untouched.
  process.exit(0)
}

let input = ''
for await (const chunk of process.stdin) input += chunk

let event
try {
  event = JSON.parse(input)
} catch {
  // A guard that cannot parse its input must not block the session.
  pass()
}

if (event.agent_type !== 'spec-creator') pass()

const tool = event.tool_name

// Bash is read-only for this agent: git archaeology, ls, rg. Anything that can
// put bytes on disk or move git state is denied, because the file-tool checks
// below cannot see it.
if (tool === 'Bash') {
  const cmd = String(event.tool_input?.command ?? '')

  // Redirection that is not a comparison (`2>&1` and `>` inside a quoted string
  // are common in read-only commands, so match the shape that actually writes).
  const REDIRECT = /(^|[^0-9<>])>{1,2}\s*[^&\s]/
  const WRITER = /\b(tee|dd|truncate|install|cp|mv|rm|rmdir|mkdir|touch|chmod|chown|ln)\b/
  const IN_PLACE = /\b(sed|perl|ruby|python3?)\b[^|]*\s-[a-zA-Z]*i\b/
  const GIT_MUTATES =
    /\bgit\s+(add|commit|push|pull|fetch|merge|rebase|reset|revert|checkout|switch|restore|stash|tag|branch\s+-|clean|apply|am|cherry-pick|mv|rm|config|remote|init|submodule|worktree)\b/
  const PKG = /\b(npm|pnpm|yarn|npx|pnpx|node|docker|docker-compose)\b/

  for (const [re, why] of [
    [REDIRECT, 'shell redirection'],
    [WRITER, 'a file-mutating command'],
    [IN_PLACE, 'an in-place editor'],
    [GIT_MUTATES, 'a state-changing git command'],
    [PKG, 'a package manager, runtime or container command'],
  ]) {
    if (re.test(cmd)) {
      deny(
        `spec-creator's shell is read-only and this command contains ${why}. ` +
          `Use Bash only for git log/show/blame, ls, rg and similar. ` +
          `Write the spec with the Write tool.`,
      )
    }
  }

  pass()
}

// Specreator creates new spec files. It does not amend existing ones — an
// agreed spec is a record, and a change to it is a new version, not an edit.
if (tool !== 'Write') {
  deny(
    `spec-creator may only create new files with Write; \`${tool}\` is blocked. ` +
      `To revise an agreed spec, write a new numbered spec file that supersedes it.`,
  )
}

const filePath = event.tool_input?.file_path
if (typeof filePath !== 'string' || filePath.length === 0) {
  deny('spec-creator: Write called without a file_path.')
}

const root = event.cwd ?? process.cwd()
const abs = resolve(root, filePath)
const rel = relative(root, abs)

if (rel.startsWith('..') || rel.startsWith(sep) || rel.length === 0) {
  deny(`spec-creator may only write inside the repository. \`${filePath}\` is outside \`${root}\`.`)
}

// Allowed: `specs/<name>.md` at the root, or `<package>/specs/<name>.md`.
// Nothing else — not docs/, not src/, not INSIGHTS.md, not a nested folder
// under specs/, and not a non-markdown file.
const SPEC_PATH = /^(?:[A-Za-z0-9._-]+\/)?specs\/[A-Za-z0-9._-]+\.md$/
const posix = rel.split(sep).join('/')

if (!SPEC_PATH.test(posix)) {
  deny(
    `spec-creator may only write \`specs/<name>.md\` or \`<package>/specs/<name>.md\`. ` +
      `\`${posix}\` is outside its lane. Single-package work goes in that package's specs/; ` +
      `cross-package work goes in the root specs/.`,
  )
}

if (posix.endsWith('/README.md') || posix === 'specs/README.md') {
  deny(`spec-creator does not edit the specs/ README — that file documents the convention it follows.`)
}

if (existsSync(abs)) {
  deny(
    `\`${posix}\` already exists and spec-creator only creates new specs. ` +
      `Pick the next free number, or hand the revision to a human.`,
  )
}

process.stdout.write(JSON.stringify(ALLOW))
