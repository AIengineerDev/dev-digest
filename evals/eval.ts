/**
 * The session-level eval runner: `eval:skills`, `eval:agents`, `eval:workflow`.
 *
 * It discovers `<kind>/**\/*.eval.ts`, runs every arm of every case `--trials`
 * times through the Claude Agent SDK (so: the Claude login on this machine, no
 * API key), grades each session against its expectations and appends one JSONL
 * record per trial. `eval:delta` and `eval:benchmark` read those records back.
 *
 *   pnpm eval:skills --list                      # what would run, no spend
 *   pnpm eval:agents --suite architecture-reviewer --trials 3
 *   pnpm eval:workflow --case dispatch --label baseline
 *
 * Exit code is the gate, and it counts only the arms that are supposed to pass:
 * a `control` arm exists to MISS, so its misses are the measurement.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Arm, EvalCase, EvalSuite } from './src/case.js';
import { grade, type Verdict } from './src/grade.js';
import { append } from './src/records.js';
import { runSession } from './src/session.js';

const here = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const KIND = (flag('kind') ?? 'skill') as EvalSuite['kind'];
const DIR = { skill: 'skills', agent: 'agents', workflow: 'workflow' }[KIND];
const TRIALS = Math.max(1, Number(flag('trials') ?? process.env.EVAL_TRIALS ?? 1));
const LABEL = flag('label') ?? 'default';
const MODEL_OVERRIDE = flag('model') ?? process.env.EVAL_MODEL;
const onlySuite = flag('suite');
const onlyCase = flag('case');
const onlyArm = flag('arm');
const LIST = argv.includes('--list');
/** Spend ceiling for the whole invocation, in dollars. */
const BUDGET = Number(flag('budget') ?? process.env.EVAL_BUDGET ?? 5);
const TIMEOUT_MS = Number(flag('timeout') ?? process.env.EVAL_TIMEOUT_MS ?? 300_000);

/** Every `*.eval.ts` under the kind's directory, one level of nesting deep. */
function suiteFiles(): string[] {
  const root = join(here, DIR);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry !== 'fixtures' && entry !== 'node_modules' && depth < 3) walk(p, depth + 1);
      } else if (entry.endsWith('.eval.ts')) out.push(p);
    }
  };
  walk(root, 0);
  return out.sort();
}

async function loadSuites(): Promise<{ suite: EvalSuite; file: string }[]> {
  const loaded: { suite: EvalSuite; file: string }[] = [];
  for (const file of suiteFiles()) {
    const mod = (await import(pathToFileURL(file).href)) as { default?: EvalSuite };
    if (!mod.default) throw new Error(`${file} has no default export`);
    if (mod.default.kind !== KIND) continue;
    if (onlySuite && !mod.default.name.startsWith(onlySuite)) continue;
    loaded.push({ suite: mod.default, file });
  }
  return loaded;
}

const bodyOf = (arm: Arm): string | undefined =>
  typeof arm.append === 'function' ? arm.append() : arm.append;

function line(v: Verdict[]): string {
  return v.map((x) => `${x.pass ? '✔' : '✘'} ${x.id}`).join('  ');
}

async function main(): Promise<void> {
  const suites = await loadSuites();
  if (!suites.length) throw new Error(`no ${KIND} suites found under evals/${DIR}/`);

  if (LIST) {
    let sessions = 0;
    for (const { suite, file } of suites) {
      process.stdout.write(`\n${suite.name}  (${resolve(file)})\n`);
      for (const c of suite.cases.filter((c) => !onlyCase || c.id.startsWith(onlyCase))) {
        const arms = suite.arms.filter((a) => !onlyArm || a.name.startsWith(onlyArm));
        process.stdout.write(
          `  ${c.id} — ${c.expect.length} expectations` +
            ` (${c.expect.filter((e) => e.absent).length} negative)\n` +
            arms.map((a) => `    ${a.name}${a.control ? '  (control, not gated)' : ''}\n`).join(''),
        );
        sessions += arms.length * TRIALS;
      }
    }
    process.stdout.write(`\n${sessions} session(s) at --trials ${TRIALS}. Budget cap $${BUDGET}.\n`);
    return;
  }

  const ranAt = new Date().toISOString();
  const rows: string[] = [];
  let spent = 0;
  let failures = 0;
  let stopped = false;

  for (const { suite, file } of suites) {
    const model = MODEL_OVERRIDE ?? suite.model ?? 'claude-sonnet-5';
    const suiteDir = dirname(file);
    const cases = suite.cases.filter((c: EvalCase) => !onlyCase || c.id.startsWith(onlyCase));
    const arms = suite.arms.filter((a) => !onlyArm || a.name.startsWith(onlyArm));

    for (const c of cases) {
      for (const arm of arms) {
        for (let trial = 1; trial <= TRIALS && !stopped; trial++) {
          if (spent >= BUDGET) {
            process.stderr.write(`\nbudget $${BUDGET} reached — stopping\n`);
            stopped = true;
            break;
          }
          process.stderr.write(`▶ ${suite.name} / ${c.id} / ${arm.name} ${trial}/${TRIALS} …\n`);
          const t = await runSession({
            prompt: c.prompt,
            cwd: c.cwd ? resolve(suiteDir, c.cwd) : resolve(here, '..'),
            model,
            maxTurns: suite.maxTurns,
            timeoutMs: TIMEOUT_MS,
            // The case's own override wins over the arm's shape — that is how a
            // control/treatment pair differing in PROJECT CONTEXT is written.
            ...(bodyOf({ ...arm, ...c.override }) ? { append: bodyOf({ ...arm, ...c.override }) } : {}),
            ...(c.override?.settingSources ?? arm.settingSources
              ? { settingSources: c.override?.settingSources ?? arm.settingSources }
              : {}),
            ...(c.override?.allowedTools ?? arm.allowedTools
              ? { allowedTools: c.override?.allowedTools ?? arm.allowedTools }
              : {}),
            ...(c.override?.disallowedTools ?? arm.disallowedTools
              ? { disallowedTools: c.override?.disallowedTools ?? arm.disallowedTools }
              : {}),
          });
          spent += t.costUsd;
          const verdicts = grade(c.expect, t);
          append({
            label: LABEL, ranAt, kind: suite.kind, suite: suite.name, case: c.id,
            arm: arm.name, control: arm.control ?? false, trial, model,
            ok: t.ok, ...(t.error ? { error: t.error } : {}),
            costUsd: t.costUsd, durationMs: t.durationMs, turns: t.turns,
            verdicts,
            tools: t.tools.map((x) => x.name),
            reads: t.reads, agents: t.agents, skills: t.skills,
          });
          const missed = verdicts.filter((v) => !v.pass);
          // A control arm is SUPPOSED to miss — that is the measurement. A
          // session that never produced a result fails either way.
          if (!arm.control) failures += missed.length;
          if (!t.ok) failures += 1;
          rows.push(
            `| ${suite.name} | ${c.id} | ${arm.name}${arm.control ? ' *' : ''} | ${trial} | ` +
              `${verdicts.filter((v) => v.pass).length}/${verdicts.length} | ${line(verdicts)} | ` +
              `${t.ok ? 'ok' : `FAILED (${t.error ?? '?'})`} | $${t.costUsd.toFixed(3)} |`,
          );
        }
      }
    }
  }

  process.stdout.write(
    [
      '',
      `### ${KIND} evals — label \`${LABEL}\`, ${TRIALS} trial(s)`,
      '',
      '| suite | case | arm | trial | passed | expectations | session | $ |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows,
      '',
      `spent $${spent.toFixed(2)} of $${BUDGET} · \`*\` = control arm, not gated`,
      '',
    ].join('\n'),
  );

  if (failures) {
    process.stderr.write(`${failures} expectation(s) missed or session(s) failed\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
