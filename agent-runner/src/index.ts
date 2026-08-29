#!/usr/bin/env node
import path from 'node:path';
import { CiFailOn } from '@devdigest/shared';
import { loadManifest } from './manifest.js';
import { loadCiEnv, isForkPr } from './env.js';
import { run } from './review.js';

/**
 * CLI entry point — this file (bundled by `npm run build` into
 * `dist/index.js`, committed by the studio's export as
 * `.devdigest/runner.mjs`) is what the generated workflow invokes:
 *
 *   node .devdigest/runner.mjs review --agent <slug> --pr <number> --fail-on <ci_fail_on>
 *
 * `server/src/modules/ci/workflow.ts` (Phase 3+) targets this exact CLI —
 * that is why the runner ships first (`plans/15-export-to-ci.plan.md`
 * `## PR topology`).
 */

interface ParsedArgs {
  command: string;
  opts: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (!flag || !flag.startsWith('--') || value === undefined) {
      throw new Error(`Unrecognised argument "${flag ?? ''}" — expected "--<name> <value>" pairs.`);
    }
    opts[flag.slice(2)] = value;
  }
  return { command: command ?? '', opts };
}

async function main(): Promise<number> {
  const { command, opts } = parseArgs(process.argv.slice(2));
  if (command !== 'review') {
    console.error(`Unknown command "${command}" — only "review" is supported.`);
    return 1;
  }

  const slug = opts.agent;
  const prArg = opts.pr;
  const failOnArg = opts['fail-on'];
  if (!slug || !prArg || !failOnArg) {
    console.error('Usage: runner review --agent <slug> --pr <number> --fail-on <ci_fail_on>');
    return 1;
  }

  const prNumber = Number(prArg);
  if (!Number.isInteger(prNumber)) {
    console.error(`--pr must be an integer, got "${prArg}"`);
    return 1;
  }

  const failOnParsed = CiFailOn.safeParse(failOnArg);
  if (!failOnParsed.success) {
    console.error(`--fail-on must be one of never|critical|warning|any, got "${failOnArg}"`);
    return 1;
  }

  const cwd = process.cwd();
  const env = loadCiEnv();

  // C10: a fork PR does not receive repository secrets. Detected from the
  // event file, never from a header or anything claimed inside the diff —
  // print the reason, post nothing, exit 0 (never reported as a failure).
  if (isForkPr(env.eventPath, env.githubRepository)) {
    console.log(
      'Fork PR detected (the pull request head repo differs from GITHUB_REPOSITORY) — a ' +
        'fork does not receive this repository’s secrets, so no review can run. Skipping.',
    );
    return 0;
  }

  // loadManifest exits the process itself on a Zod validation failure (C4).
  const manifest = loadManifest(path.join(cwd, '.devdigest', 'agents', `${slug}.yaml`));

  return run({
    manifest,
    cwd,
    base: env.baseRef,
    head: env.headRef,
    githubRepository: env.githubRepository,
    githubToken: env.githubToken,
    prNumber,
    configuredFailOn: failOnParsed.data,
  });
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
