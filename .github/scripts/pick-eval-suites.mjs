#!/usr/bin/env node
/**
 * Decide which eval suites a change needs, and say out loud what it skipped.
 *
 * Writes `suites=<json array>` and `full=<true|false>` to $GITHUB_OUTPUT (or
 * stdout when run locally), and a human-readable account to stderr and to
 * $GITHUB_STEP_SUMMARY.
 *
 * Rules, in order:
 *   1. A repo-wide file changed (AGENTS.md / CLAUDE.md, an agent prompt, a
 *      seeded agent, the harness itself) -> every suite. These are shared by
 *      every arm of every suite, so a change to one invalidates all of them.
 *   2. Otherwise, each changed `skills/<X>/**` or `.claude/skills/<X>/**` maps
 *      to suite <X> -- but only if <X> actually has `evals/expected.json`.
 *      A skill with no evals is SKIPPED and named, never failed: most skills
 *      have none, and a red build for that would train people to ignore CI.
 *
 * Reads the changed-file list from git. In a pull_request run, BASE_SHA and
 * HEAD_SHA come from the event payload; locally it falls back to origin/main.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKILL_ROOTS = ['skills', '.claude/skills'];

/** Any of these means "the change is not scoped to one skill" -> run everything. */
const REPO_WIDE = [
  /(^|\/)AGENTS\.md$/,
  /(^|\/)CLAUDE\.md$/,
  /^\.claude\/agents\//,
  /\/evals\/agent\.md$/,
  /^server\/src\/db\/seed-.*\.ts$/,
  /^docs\/agent-prompts\//,
  /^evals\//,
  /^\.github\/(workflows\/evals\.yml|scripts\/pick-eval-suites\.mjs)$/,
];

function changedFiles() {
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA ?? 'HEAD';
  const range = base ? `${base}...${head}` : 'origin/main...HEAD';
  try {
    return execFileSync('git', ['diff', '--name-only', range], { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    console.error(`could not diff ${range}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

/** Every suite on disk, whether or not anything changed. */
function allSuites() {
  const out = [];
  for (const root of SKILL_ROOTS) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (existsSync(join(root, name, 'evals', 'expected.json'))) out.push(name);
    }
  }
  return [...new Set(out)].sort();
}

/** Skills that exist but carry no eval suite — reported, never failed. */
function skillsWithoutEvals() {
  const out = [];
  for (const root of SKILL_ROOTS) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (!existsSync(join(root, name))) continue;
      if (!existsSync(join(root, name, 'evals', 'expected.json'))) out.push(`${root}/${name}`);
    }
  }
  return [...new Set(out)].sort();
}

const files = changedFiles();
const known = new Set(allSuites());
const lines = [];
const note = (s) => {
  lines.push(s);
  console.error(s);
};

const full = files.some((f) => REPO_WIDE.some((re) => re.test(f)));
let suites;

if (full) {
  suites = allSuites();
  const why = files.find((f) => REPO_WIDE.some((re) => re.test(f)));
  note(`repo-wide change (\`${why}\`) — running every suite`);
} else {
  const touched = new Set();
  const skipped = new Set();
  for (const f of files) {
    for (const root of SKILL_ROOTS) {
      const m = f.startsWith(`${root}/`) ? f.slice(root.length + 1).split('/')[0] : null;
      if (!m) continue;
      if (known.has(m)) touched.add(m);
      else skipped.add(`${root}/${m}`);
    }
  }
  suites = [...touched].sort();
  for (const s of suites) note(`skill \`${s}\` — evals found, queued`);
  for (const s of [...skipped].sort()) note(`skill \`${s}\` — no \`evals/expected.json\`, **skipped**`);
  if (!suites.length && !skipped.size) note('no skill or repo-wide file changed — nothing to run');
}

if (!suites.length) note('_No eval suites matched these changes._');

const uncovered = skillsWithoutEvals();
if (uncovered.length) {
  note(`\nSkills with no eval suite (${uncovered.length}): ${uncovered.map((s) => `\`${s}\``).join(', ')}`);
}

const out = `suites=${JSON.stringify(suites)}\nfull=${full}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
else process.stdout.write(out);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Eval scope\n\n${lines.join('\n\n')}\n`);
}
