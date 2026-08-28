/**
 * Score saved runs against the CURRENT expected.json and print the per-plant
 * matrix — one column per arm, whichever result files the arms came from.
 *
 * Two jobs, and both exist because arms are independent measurements:
 *   - compare arms that were run at different times, without re-paying;
 *   - re-score every arm after the scorecard's regexes are tightened, which
 *     they will be the first time a plant is credited for the wrong reason.
 *
 *   npm run delta -- --suite onion-architecture                 # every result file
 *   npm run delta -- --suite onion-architecture results/a.json results/b.json
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Finding } from '@devdigest/shared';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOTS = [resolve(here, '..', 'skills'), resolve(here, '..', '.claude', 'skills')];

const argv = process.argv.slice(2);
const suiteName = argv[argv.indexOf('--suite') + 1];
if (!suiteName || argv.indexOf('--suite') < 0) throw new Error('usage: --suite <name> [files…]');
const files = argv.filter((a) => a.endsWith('.json'));

const dir = SKILL_ROOTS.map((r) => join(r, suiteName, 'evals')).find((d) =>
  existsSync(join(d, 'expected.json')),
);
if (!dir) throw new Error(`no suite ${suiteName}`);
interface Expectation {
  id: string;
  file: string;
  patterns: string[];
  arms?: string[];
}
const spec = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as {
  cases: { id: string; title: string; expected: Expectation[] }[];
};
/**
 * Expectations are per CASE, and a record is per (arm, case). Flattening every
 * case's plants into one list and keying columns by arm alone silently drops
 * every case but the last — it rendered 0/2 for seven plants the run itself had
 * just scored 7/7.
 */
const byCase = new Map(spec.cases.map((c) => [c.id, c.expected]));

const resultFiles = (
  files.length
    ? files
    : readdirSync(join(here, 'results'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(here, 'results', f))
).sort();

const hay = (f: Finding) => `${f.title}\n${f.rationale}\n${f.suggestion ?? ''}`.toLowerCase();

/** Same 1:1, most-constrained-first assignment the harness scores with. */
function assign(expected: Expectation[], findings: Finding[]): Set<string> {
  const pool = expected.map((e) => ({
    e,
    c: findings.filter(
      (f) =>
        new RegExp(e.file, 'i').test(f.file) &&
        e.patterns.every((p) => new RegExp(p, 'i').test(hay(f))),
    ),
  }));
  pool.sort((a, b) => a.c.length - b.c.length);
  const taken = new Set<Finding>();
  const got = new Set<string>();
  for (const { e, c } of pool) {
    const pick = c.find((f) => !taken.has(f));
    if (!pick) continue;
    taken.add(pick);
    got.add(e.id);
  }
  return got;
}

interface Col {
  caseId: string;
  arm: string;
  model: string;
  runs: number;
  repoMap: number;
  skills: number;
  hits: Map<string, number>;
  noise: number[];
  tokensIn: number;
  tokensOut: number;
  cost: number;
  file: string;
}
const cols: Col[] = [];

for (const file of resultFiles) {
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  for (const armDoc of doc.arms ?? []) {
    if (armDoc.suite !== suiteName) continue;
    const ok = (armDoc.runs ?? []).filter((r: { findings?: Finding[] }) => r.findings);
    if (!ok.length) continue;
    const expected = byCase.get(armDoc.case);
    if (!expected) continue;
    const hits = new Map<string, number>();
    const noise: number[] = [];
    for (const r of ok) {
      const got = assign(expected, r.findings);
      for (const id of got) hits.set(id, (hits.get(id) ?? 0) + 1);
      noise.push(r.findings.length - got.size);
    }
    cols.push({
      caseId: armDoc.case,
      arm: armDoc.arm,
      model: armDoc.model ?? doc.model,
      runs: ok.length,
      repoMap: ok[0]?.repoMapChars ?? 0,
      skills: ok[0]?.skillsChars ?? 0,
      hits,
      noise,
      tokensIn: Math.round(ok.reduce((n: number, r: { tokensIn: number }) => n + r.tokensIn, 0) / ok.length),
      tokensOut: Math.round(ok.reduce((n: number, r: { tokensOut: number }) => n + r.tokensOut, 0) / ok.length),
      cost: ok.reduce((n: number, r: { costUsd: number | null }) => n + (r.costUsd ?? 0), 0),
      file: file.split('/').pop()!,
    });
  }
}
if (!cols.length) throw new Error(`no saved runs for suite ${suiteName}`);

// Latest measurement of each (arm, case) wins; files are sorted by timestamp.
const latest = new Map<string, Col>();
for (const c of cols) latest.set(`${c.caseId}::${c.arm}`, c);
const caseIds = [...new Set([...latest.values()].map((c) => c.caseId))];
console.log(`# Delta — ${suiteName}\n`);

for (const caseId of caseIds) {
  const expected = byCase.get(caseId)!;
  const arms = [...latest.values()].filter((c) => c.caseId === caseId);
  const owes = (id: string, arm: string) => {
    const e = expected.find((x) => x.id === id)!;
    return !e.arms?.length || e.arms.includes(arm);
  };
  const cell = (c: Col, id: string) => {
    const n = c.hits.get(id) ?? 0;
    return `${n}/${c.runs}${owes(id, c.arm) ? '' : n ? ' \u1d47' : ''}`;
  };
  const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
  const foundMean = (a: Col) =>
    (expected.reduce((n, e) => n + (a.hits.get(e.id) ?? 0), 0) / a.runs).toFixed(1);

  console.log(`## ${caseId}\n`);
  const conditions = new Set(arms.map((a) => `${a.model}|repoMap=${a.repoMap > 0}`));
  if (conditions.size > 1 || new Set(arms.map((a) => a.runs)).size > 1) {
    console.log('> **These columns are NOT directly comparable.**\n>');
    for (const a of arms) {
      console.log(
        `> - \`${a.arm}\`: ${a.runs} run(s), ${a.model}, ` +
          `repo map ${a.repoMap ? `${a.repoMap}c` : 'none'}, skills ${a.skills}c`,
      );
    }
    console.log('>\n> Re-measure the odd ones out before reading a delta across them.\n');
  }
  console.log(`| plant | ${arms.map((a) => `\`${a.arm}\` (n=${a.runs})`).join(' | ')} |`);
  console.log(`| --- | ${arms.map(() => '---').join(' | ')} |`);
  for (const e of expected) {
    console.log(`| \`${e.id}\` | ${arms.map((a) => cell(a, e.id)).join(' | ')} |`);
  }
  console.log(`| **owed** | ${arms.map((a) => expected.filter((e) => owes(e.id, a.arm)).length).join(' | ')} |`);
  console.log(`| **found (mean)** | ${arms.map(foundMean).join(' | ')} |`);
  console.log(`| **unmatched (mean)** | ${arms.map((a) => mean(a.noise)).join(' | ')} |`);
  console.log(`| **tokens in/out** | ${arms.map((a) => `${a.tokensIn}/${a.tokensOut}`).join(' | ')} |`);
  console.log(`| **$ total** | ${arms.map((a) => a.cost.toFixed(2)).join(' | ')} |`);
  console.log('');
}
console.log(`\u1d47 = found although this arm's skills never asked for it (beyond spec).`);
console.log(`Scored against the current \`expected.json\`, not the scorecard each run shipped with.`);
process.exit(0);
