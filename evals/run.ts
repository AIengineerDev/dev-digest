/**
 * `@devdigest/evals` — the A/B harness for skill-carrying agents.
 *
 * A suite is a directory `skills/<name>/evals/` holding `expected.json`, a
 * `baseline/`, `cases/` and generated `diffs/`. This package owns none of that
 * material — it discovers, runs and scores it, so a skill stays deliverable as
 * one folder with its evals inside.
 *
 * Each case runs TWICE against the same diff, the same prompt, the same model
 * and `strategy: 'single-pass'`. The only variable is whether the suite's skill
 * bodies are in the `skills` prompt slot — exactly what linking or unlinking
 * them in the Skills tab changes.
 *
 *   npm run eval                          # every suite, claude-opus-5
 *   npm run eval -- --suite api-contract-reviewer --cases 01,03
 *   npm run eval -- --model claude-haiku-4-5
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Finding, Review } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { EvalAnthropicProvider } from './src/anthropic.js';
// Two files are imported out of the server, and only two. Both are leaves:
// `diff-parser` has one `import type` line and `seed-api-contract` has none, so
// neither drags the server package into this program. The parser is imported
// rather than copied on purpose — it decides which lines the grounding gate
// accepts, and a drifted copy would silently change every score.
import { parseUnifiedDiff } from '../server/src/adapters/git/diff-parser.js';
import * as seed from '../server/src/db/seed-api-contract.js';

const here = dirname(fileURLToPath(import.meta.url));
/**
 * Both skill roots, and they are unrelated systems that happen to share a word.
 * `skills/` is PRODUCT data — skills the application manages for its users.
 * `.claude/skills/` is the Claude Code skill directory. A suite may live in
 * either, because a skill of either kind is a body of text dropped into a
 * prompt, and that is the only property this harness cares about.
 */
const SKILL_ROOTS = [resolve(here, '..', 'skills'), resolve(here, '..', '.claude', 'skills')];

// ---------- CLI ----------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const MODEL = flag('model') ?? process.env.EVAL_MODEL ?? 'claude-opus-5';
const onlySuites = flag('suite')?.split(',').map((s) => s.trim()).filter(Boolean);
const onlyCases = flag('cases')?.split(',').map((s) => s.trim()).filter(Boolean);
/**
 * Repetitions per arm. One run of a non-deterministic reviewer is an anecdote:
 * the models that matter here reject `temperature`, so there is no seed to pin
 * and the only honest answer to "does the skill catch this" is a hit rate.
 *
 * Capped at MAX_REPS to keep a sweep affordable. What that costs in confidence
 * is real and worth stating: at n=2 the only readable outcomes are 0/2 and 2/2.
 * A 1/2 tells you the plant is unstable and nothing more — never read it as
 * "half the time", and never compare a 1/2 against a 2/2 as if it were a delta.
 */
const MAX_REPS = 2;
const requestedReps = Math.max(1, Number(flag('reps') ?? process.env.EVAL_REPS ?? 1));
const REPS = Math.min(MAX_REPS, requestedReps);
if (requestedReps > MAX_REPS) {
  process.stderr.write(
    `note: --reps ${requestedReps} capped at ${MAX_REPS} (MAX_REPS in run.ts)\n`,
  );
}
/**
 * Run only these arms. Arms are independent measurements of the same fixture,
 * so a new arm can be added to a suite and measured on its own — re-running the
 * ones already on record buys nothing and costs the same as the first time.
 */
const onlyArms = flag('arms')?.split(',').map((s) => s.trim()).filter(Boolean);
/** Print what WOULD run, and what it would cost, without spending anything. */
const listOnly = argv.includes('--list');

// ---------- suite shape --------------------------------------------------
interface Expectation {
  id: string;
  what: string;
  file: string;
  patterns: string[];
  /**
   * Which arms are supposed to catch this. Omitted = all of them. An arm not
   * listed here is still SCORED against it — that is the interesting number —
   * but missing it is not a regression, because nothing in that arm's skill
   * text asks for it.
   */
  arms?: string[];
}
interface CaseSpec {
  id: string;
  title: string;
  expected: Expectation[];
}
/** One arm of the comparison: a name and the skill bodies it attaches. */
interface Arm {
  name: string;
  skills: string[];
  /**
   * A baseline arm is SUPPOSED to miss plants — that is what it measures. Keep
   * it out of the exit gate, or a suite with a zero baseline is red forever.
   */
  baseline?: boolean;
}
interface SuiteFile {
  agent: {
    prompt: string;
    /**
     * Optional repo skeleton handed to every arm. The reviewer otherwise sees
     * ONLY the diff — it cannot know which files exist, so "you forgot to
     * change X" is unanswerable when X is not in the diff. Same content for
     * every arm, so it never becomes the variable under test.
     */
    repoMap?: string;
    /** on/off form: one skill set, compared against the empty slot. */
    skills?: string[];
    /** variant form: N named arms, e.g. the live skill vs a candidate rewrite. */
    arms?: Arm[];
  };
  cases: CaseSpec[];
}
interface Suite extends SuiteFile {
  name: string;
  dir: string;
}

/** Every `<skill root>/<name>/evals/expected.json` in the repo. */
function discoverSuites(): Suite[] {
  const out: Suite[] = [];
  for (const root of SKILL_ROOTS) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      const dir = join(root, name, 'evals');
      const file = join(dir, 'expected.json');
      if (!existsSync(file)) continue;
      out.push({ name, dir, ...(JSON.parse(readFileSync(file, 'utf8')) as SuiteFile) });
    }
  }
  return out;
}

/**
 * The arms to run. A suite that declares `skills` gets the default on/off pair;
 * a suite that declares `arms` gets exactly those, in order. `without-skills`
 * is expressed as an arm with no bodies, so both forms are one code path.
 */
function armsOf(suite: Suite): Arm[] {
  if (suite.agent.arms?.length) return suite.agent.arms;
  return [
    { name: 'without-skills', skills: [] },
    { name: 'with-skills', skills: suite.agent.skills ?? [] },
  ];
}

/**
 * `seed:<export>` reads server/src/db/seed-api-contract.ts — an import-free
 * data module, so pulling it in costs nothing but the file itself. A seeded
 * skill is matched by name inside API_CONTRACT_SKILLS; anything else is read
 * as a plain export. `file:<path>` is read relative to the suite directory.
 */
function resolveRef(ref: string, suite: Suite): string {
  if (ref.startsWith('file:')) return readFileSync(join(suite.dir, ref.slice(5)), 'utf8');
  if (ref.startsWith('seed:')) {
    const key = ref.slice(5);
    const named = seed.API_CONTRACT_SKILLS.find((s) => s.name === key);
    if (named) return named.body;
    const value = (seed as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
    throw new Error(`seed export not found or not a string: ${key}`);
  }
  throw new Error(`unknown ref (expected seed: or file:): ${ref}`);
}

// ---------- scoring ------------------------------------------------------
function haystack(f: Finding): string {
  return `${f.title}\n${f.rationale}\n${f.suggestion ?? ''}`.toLowerCase();
}

/** Every finding that cites the right file and says all of it. */
function candidates(exp: Expectation, findings: Finding[]): Finding[] {
  const file = new RegExp(exp.file, 'i');
  const pats = exp.patterns.map((p) => new RegExp(p, 'i'));
  return findings.filter((f) => file.test(f.file) && pats.every((p) => p.test(haystack(f))));
}

/**
 * Assign findings to expectations ONE-TO-ONE.
 *
 * Taking the first regex match per expectation independently is wrong twice
 * over, and both halves were observed in a real run: a single broad finding
 * satisfied two expectations at once (crediting a plant nobody had reported
 * separately), and it also stole the credit from the finding that actually
 * reported that plant, which then surfaced in the report as unexplained noise.
 *
 * Most-constrained-first: an expectation with exactly one candidate takes it
 * before an expectation with three gets to choose. Small bipartite matching by
 * hand — there are never more than a dozen of either side.
 */
function assign(expected: Expectation[], findings: Finding[]): Map<string, Finding> {
  const pool = expected.map((exp) => ({ exp, cands: candidates(exp, findings) }));
  pool.sort((a, b) => a.cands.length - b.cands.length);
  const taken = new Set<Finding>();
  const matched = new Map<string, Finding>();
  for (const { exp, cands } of pool) {
    const pick = cands.find((f) => !taken.has(f));
    if (!pick) continue;
    taken.add(pick);
    matched.set(exp.id, pick);
  }
  return matched;
}

interface ArmResult {
  arm: string;
  review: Review;
  found: string[];
  missed: string[];
  /** Detected although this arm's skills never asked for it. */
  beyondSpec: string[];
  unmatched: Finding[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  grounding: string;
  skillsChars: number;
  repoMapChars: number;
  /** Structured-output attempts: >1 means the model missed the schema and was re-prompted. */
  attempts: number;
}
/** An arm that never produced a review is RECORDED, not thrown: a weak model
    failing the structured-output schema is itself a result. */
interface ArmFailure {
  arm: string;
  error: string;
}
type ArmOutcome = ArmResult | ArmFailure;
const failed = (r: ArmOutcome): r is ArmFailure => 'error' in r;

async function runArm(
  spec: CaseSpec,
  diffText: string,
  arm: Arm,
  systemPrompt: string,
  skillBodies: string[],
  repoMap: string | undefined,
  llm: EvalAnthropicProvider,
): Promise<ArmResult> {
  const out = await reviewPullRequest({
    systemPrompt,
    model: MODEL,
    diff: parseUnifiedDiff(diffText),
    llm,
    strategy: 'single-pass',
    task: `Review PR "${spec.title}".`,
    ...(repoMap ? { repoMap } : {}),
    // An arm with no bodies leaves the slot out entirely — that is what an
    // agent with nothing linked sends.
    ...(skillBodies.length ? { skills: skillBodies } : {}),
  });

  const findings = out.review.findings;
  const matched = assign(spec.expected, findings);
  const claimed = new Set([...matched.values()]);
  const applies = (e: Expectation) => !e.arms?.length || e.arms.includes(arm.name);
  return {
    arm: arm.name,
    review: out.review,
    found: [...matched.keys()],
    missed: spec.expected.filter((e) => applies(e) && !matched.has(e.id)).map((e) => e.id),
    beyondSpec: spec.expected.filter((e) => !applies(e) && matched.has(e.id)).map((e) => e.id),
    unmatched: findings.filter((f) => !claimed.has(f)),
    tokensIn: out.tokensIn,
    tokensOut: out.tokensOut,
    costUsd: out.costUsd,
    grounding: out.grounding,
    skillsChars: out.assembly.skills?.length ?? 0,
    repoMapChars: out.assembly.repo_map?.length ?? 0,
    attempts: llm.lastAttempts,
  };
}

/** Per-plant hit rate plus spend, over REPS runs of one arm. */
interface ArmAggregate {
  arm: string;
  reps: number;
  ok: number;
  failures: string[];
  /** expectation id → how many runs found it */
  hits: Map<string, number>;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  runs: ArmResult[];
}

function aggregate(arm: string, outcomes: ArmOutcome[]): ArmAggregate {
  const runs = outcomes.filter((o): o is ArmResult => !failed(o));
  const hits = new Map<string, number>();
  for (const r of runs) for (const id of r.found) hits.set(id, (hits.get(id) ?? 0) + 1);
  return {
    arm,
    reps: outcomes.length,
    ok: runs.length,
    failures: outcomes.filter(failed).map((f) => f.error),
    hits,
    tokensIn: runs.reduce((n, r) => n + r.tokensIn, 0),
    tokensOut: runs.reduce((n, r) => n + r.tokensOut, 0),
    costUsd: runs.reduce((n, r) => n + (r.costUsd ?? 0), 0),
    runs,
  };
}

function renderFindings(findings: Finding[]): string {
  if (!findings.length) return '_none_\n';
  return (
    findings
      .map(
        (f) =>
          `- **${f.severity.toUpperCase()}** ${f.title}\n` +
          `  - \`${f.file}:${f.start_line}-${f.end_line}\`\n` +
          `  - ${f.rationale.replace(/\n+/g, ' ').trim()}`,
      )
      .join('\n') + '\n'
  );
}

// ---------- main ---------------------------------------------------------
async function main(): Promise<void> {
  const suites = discoverSuites().filter(
    (s) => !onlySuites?.length || onlySuites.some((p) => s.name.startsWith(p)),
  );
  if (!suites.length) throw new Error('no eval suites found under skills/*/evals/');

  if (listOnly) {
    let calls = 0;
    for (const suite of suites) {
      const arms = armsOf(suite).filter(
        (a) => !onlyArms?.length || onlyArms.some((p) => a.name.startsWith(p)),
      );
      const cases = suite.cases.filter(
        (c) => !onlyCases?.length || onlyCases.some((p) => c.id.startsWith(p)),
      );
      process.stdout.write(`\n${suite.name}  (${suite.dir})\n`);
      for (const c of cases) {
        const owed = (arm: string) =>
          c.expected.filter((e) => !e.arms?.length || e.arms.includes(arm)).length;
        process.stdout.write(
          `  ${c.id} — ${c.expected.length} plants\n` +
            arms
              .map(
                (a) =>
                  `    ${a.name.padEnd(16)} owes ${owed(a.name)}` +
                  `${a.baseline ? '  (baseline, not gated)' : ''}\n`,
              )
              .join(''),
        );
        calls += arms.length * REPS;
      }
    }
    // Rough per-call cost, measured on these fixtures rather than derived from
    // list prices: a call is ~20-30k in and ~4-9k out once thinking is counted.
    const perCall = /opus|fable|mythos/.test(MODEL)
      ? 0.3
      : /sonnet/.test(MODEL)
        ? 0.12
        : 0.06;
    process.stdout.write(
      `\n${calls} LLM call(s) at --reps ${REPS} on ${MODEL}` +
        ` — roughly $${(calls * perCall).toFixed(2)} (order of magnitude, not a quote).\n`,
    );
    return;
  }

  const key = readKey();
  const llm = new EvalAnthropicProvider(key);

  const started = new Date().toISOString();
  const head: string[] = [
    '# Skill A/B eval',
    '',
    `- model: \`${MODEL}\``,
    `- run at: ${started}`,
    `- repetitions: ${REPS} per arm`,
    '- arms: same prompt, same diff; only the `skills` prompt slot differs',
    '',
  ];
  const table: string[] = [
    '| suite | case | arm | runs | owed | found (mean) | never found | flaky | beyond spec | tokens in/out (mean) | $ total |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const body: string[] = [];
  /**
   * Raw record of every run, written next to the report. The scorecard is
   * regexes over model prose, so it WILL need tightening after a run shows it
   * crediting the right file for the wrong reason — and re-scoring must not
   * mean paying for the runs again, or parsing them back out of markdown.
   */
  const raw: unknown[] = [];
  let regressions = 0;

  for (const suite of suites) {
    const systemPrompt = resolveRef(suite.agent.prompt, suite);
    const repoMap = suite.agent.repoMap ? resolveRef(suite.agent.repoMap, suite) : undefined;
    const arms = armsOf(suite).filter(
      (a) => !onlyArms?.length || onlyArms.some((p) => a.name.startsWith(p)),
    );
    if (!arms.length) throw new Error(`--arms matched nothing in suite ${suite.name}`);
    const cases = suite.cases.filter(
      (c) => !onlyCases?.length || onlyCases.some((p) => c.id.startsWith(p)),
    );

    for (const spec of cases) {
      const diffText = readFileSync(join(suite.dir, 'diffs', `${spec.id}.diff`), 'utf8');
      body.push(`## ${suite.name} / ${spec.id} — ${spec.title}`, '');

      for (const arm of arms) {
        const skillBodies = arm.skills.map((ref) => resolveRef(ref, suite));
        const owed = spec.expected.filter((e) => !e.arms?.length || e.arms.includes(arm.name));
        const outcomes: ArmOutcome[] = [];

        for (let rep = 1; rep <= REPS; rep++) {
          process.stderr.write(`▶ ${suite.name} / ${spec.id} / ${arm.name} ${rep}/${REPS} …\n`);
          try {
            outcomes.push(
              await runArm(spec, diffText, arm, systemPrompt, skillBodies, repoMap, llm),
            );
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            outcomes.push({ arm: arm.name, error });
            process.stderr.write(`  ✗ ${error}\n`);
          }
        }

        raw.push({
          suite: suite.name,
          case: spec.id,
          arm: arm.name,
          model: MODEL,
          skillRefs: arm.skills,
          baseline: arm.baseline ?? false,
          runs: outcomes.map((o) =>
            failed(o)
              ? { error: o.error }
              : {
                  verdict: o.review.verdict,
                  score: o.review.score,
                  grounding: o.grounding,
                  tokensIn: o.tokensIn,
                  tokensOut: o.tokensOut,
                  costUsd: o.costUsd,
                  attempts: o.attempts,
                  skillsChars: o.skillsChars,
                  repoMapChars: o.repoMapChars,
                  findings: o.review.findings,
                },
          ),
        });

        const agg = aggregate(arm.name, outcomes);
        const rate = (id: string) => agg.hits.get(id) ?? 0;
        // A plant nobody ever caught is the regression. A plant caught in some
        // runs and not others is FLAKY — reported loudly, but it is a property
        // of the model, not a broken gate, so it does not fail the run.
        const hardMisses = owed.filter((e) => rate(e.id) === 0);
        const flaky = owed.filter((e) => rate(e.id) > 0 && rate(e.id) < agg.ok);
        const beyond = spec.expected.filter((e) => !owed.includes(e) && rate(e.id) > 0);
        // A baseline arm measures what is found WITHOUT the rules; missing a
        // plant there is the result, not a regression. Failures still count.
        regressions += (arm.baseline ? 0 : hardMisses.length) + agg.failures.length;

        const meanFound = agg.ok ? agg.runs.reduce((n, r) => n + r.found.length, 0) / agg.ok : 0;
        table.push(
          `| ${suite.name} | ${spec.id} | ${arm.name} | ${agg.ok}/${agg.reps} | ${owed.length} | ` +
            `${meanFound.toFixed(1)} | ${hardMisses.map((e) => e.id).join(', ') || '—'} | ` +
            `${flaky.map((e) => `${e.id} ${rate(e.id)}/${agg.ok}`).join(', ') || '—'} | ` +
            `${beyond.map((e) => `${e.id} ${rate(e.id)}/${agg.ok}`).join(', ') || '—'} | ` +
            `${agg.ok ? Math.round(agg.tokensIn / agg.ok) : 0}/${agg.ok ? Math.round(agg.tokensOut / agg.ok) : 0} | ` +
            `${agg.costUsd.toFixed(2)} |`,
        );

        body.push(`### ${arm.name} — ${agg.ok}/${agg.reps} runs completed`, '');
        if (agg.failures.length) {
          body.push(`**Failed runs:** ${agg.failures.join(' · ')}`, '');
        }
        body.push(
          `| plant | owed | hit rate | what |`,
          `| --- | --- | --- | --- |`,
          ...spec.expected.map(
            (e) =>
              `| \`${e.id}\` | ${owed.includes(e) ? 'yes' : 'no'} | ` +
              `**${rate(e.id)}/${agg.ok}** | ${e.what} |`,
          ),
          '',
        );
        const verdicts = agg.runs.map((r) => r.review.verdict);
        const scores = agg.runs.map((r) => r.review.score);
        const noise = agg.runs.map((r) => r.unmatched.length);
        const attempts = agg.runs.map((r) => r.attempts);
        body.push(
          `verdicts: ${[...new Set(verdicts)].join(', ') || '—'} · ` +
            `scores: ${scores.join(', ') || '—'} · ` +
            `unmatched findings per run: ${noise.join(', ') || '—'} · ` +
            `structured-output attempts per run: ${attempts.join(', ') || '—'} · ` +
            `skills slot ${agg.runs[0]?.skillsChars ?? 0} chars · ` +
            `repo map ${agg.runs[0]?.repoMapChars ?? 0} chars` +
            (arm.baseline ? ' · **baseline — excluded from the gate**' : ''),
          '',
        );
        agg.runs.forEach((r, i) => {
          body.push(`<details><summary>run ${i + 1} — all findings</summary>`, '');
          body.push(renderFindings(r.review.findings));
          body.push('</details>', '');
        });
      }
    }
  }

  mkdirSync(join(here, 'results'), { recursive: true });
  const stamp = started.replace(/[:.]/g, '-');
  const out = join(here, 'results', `${stamp}.md`);
  const rawOut = join(here, 'results', `${stamp}.json`);
  writeFileSync(out, [...head, ...table, '', ...body].join('\n'));
  writeFileSync(rawOut, JSON.stringify({ model: MODEL, startedAt: started, reps: REPS, arms: raw }, null, 2));
  process.stderr.write(`\n${table.join('\n')}\n\nwrote ${out}\n      ${rawOut}\n`);

  // The gate: any missed plant, or any arm that produced nothing.
  if (regressions) {
    process.stderr.write(`\n${regressions} plant(s) never found, or run(s) failed\n`);
    process.exitCode = 1;
  }
}

/** ANTHROPIC_API_KEY from the env, else the same store the server reads. */
function readKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const path = join(homedir(), '.devdigest', 'secrets.json');
  try {
    const stored = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    if (stored.ANTHROPIC_API_KEY) return stored.ANTHROPIC_API_KEY;
  } catch {
    // no store on disk — fall through to the error below
  }
  throw new Error(`ANTHROPIC_API_KEY not set and not present in ${path}`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
