/**
 * "How to run" derivation (R4, R5, C6) — pure over an INJECTED `readFile`,
 * never `container.git` directly (same trick `assemble.ts` uses for the
 * tokenizer): `SimpleGitClient.readFile` is a bare `fs.readFile` and throws
 * ENOENT (`adapters/git/simple-git.ts:129-130`), so every read here is in its
 * own try/catch — a thrown read is an absent fact, not a module failure.
 * `MockGitClient.readFile` returns `''` and never throws
 * (`server/INSIGHTS.md`, 2026-08-19) — a C6 test MUST inject a throwing
 * function, not rely on that mock, or it exercises the found-but-empty
 * branch instead of the absent-file one.
 *
 * Emits R5's WHITELIST as a value: the exact, exhaustive set of commands
 * `filterSteps` (`grounding.ts`, A4) treats as ground truth. `run_steps` in
 * the skeleton (`skeleton.ts`) is a fixed-order SUBSET of this whitelist —
 * install, then `cp`, then compose, then the `dev` script — not every
 * declared script.
 *
 * No `.env`/`.env.local` is ever opened — only `.env.example`/`.env.sample`,
 * and only variable NAMES are read out of them, never values (R16, A16).
 */

export type ReadFile = (path: string) => Promise<string>;

export interface ConfigDerivation {
  packageManager: string;
  scripts: string[];
  envExampleVars: string[];
  /** The `.env.example`/`.env.sample` filename actually found, or `null`. */
  envExampleFile: string | null;
  composeServices: string[];
  dockerfilePresent: boolean;
  /** Every valid command, in whitelist order — R5's grounding reference set
   *  for `filterSteps`. */
  whitelist: string[];
  /** The skeleton's own ordered run steps — `install → cp → compose → dev`,
   *  each included only when its underlying fact exists. */
  skeletonSteps: string[];
}

async function tryRead(readFile: ReadFile, path: string): Promise<string | null> {
  try {
    return await readFile(path);
  } catch {
    return null; // absent file (ENOENT) or unreadable clone — a missing fact, not a throw
  }
}

function detectPackageManagerFromField(pkgJson: string): string | null {
  try {
    const parsed = JSON.parse(pkgJson) as { packageManager?: string };
    if (typeof parsed.packageManager === 'string') {
      const name = parsed.packageManager.split('@')[0];
      if (name) return name;
    }
  } catch {
    // malformed package.json — no packageManager fact
  }
  return null;
}

function parseScripts(pkgJson: string): string[] {
  try {
    const parsed = JSON.parse(pkgJson) as { scripts?: Record<string, string> };
    return Object.keys(parsed.scripts ?? {});
  } catch {
    return [];
  }
}

/** Variable NAMES only — never a value, never a whole line beyond the key. */
function parseEnvVarNames(content: string): string[] {
  const names: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(trimmed);
    if (match) names.push(match[1]!);
  }
  return names;
}

/** Naive top-level `services:` block extraction — no YAML dependency in this
 *  server; sufficient for the common two-space-indented compose shape. A
 *  compose file this can't parse yields no services, never a throw. */
function parseComposeServices(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const servicesIdx = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (servicesIdx === -1) return [];
  const services: string[] = [];
  for (let i = servicesIdx + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/^\S/.test(line)) break; // dedented back to top level — block ended
    const match = /^ {2}([A-Za-z0-9_.-]+):\s*$/.exec(line);
    if (match) services.push(match[1]!);
  }
  return services;
}

const LOCKFILE_PM: readonly [string, string][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

export async function deriveConfig(readFile: ReadFile): Promise<ConfigDerivation> {
  const pkgJson = await tryRead(readFile, 'package.json');
  const scripts = pkgJson ? parseScripts(pkgJson) : [];

  let packageManager = pkgJson ? detectPackageManagerFromField(pkgJson) : null;
  if (!packageManager) {
    for (const [lockfile, pm] of LOCKFILE_PM) {
      const found = await tryRead(readFile, lockfile);
      if (found !== null) {
        packageManager = pm;
        break;
      }
    }
  }
  packageManager ??= 'npm';

  let envExampleFile: string | null = null;
  let envExampleVars: string[] = [];
  for (const candidate of ['.env.example', '.env.sample']) {
    const content = await tryRead(readFile, candidate);
    if (content !== null) {
      envExampleFile = candidate;
      envExampleVars = parseEnvVarNames(content);
      break;
    }
  }

  let composeServices: string[] = [];
  for (const candidate of ['docker-compose.yml', 'docker-compose.yaml']) {
    const content = await tryRead(readFile, candidate);
    if (content !== null) {
      composeServices = parseComposeServices(content);
      break;
    }
  }

  const dockerfilePresent = (await tryRead(readFile, 'Dockerfile')) !== null;

  // No package.json → no "install" fact either (C6): there is nothing this
  // repo has declared it can be installed FROM.
  const whitelist: string[] = pkgJson !== null ? [`${packageManager} install`] : [];
  for (const script of scripts) whitelist.push(`${packageManager} ${script}`);
  if (composeServices.length > 0) whitelist.push(`docker compose up -d ${composeServices.join(' ')}`);
  if (envExampleFile) whitelist.push(`cp ${envExampleFile} .env`);

  const skeletonSteps: string[] = pkgJson !== null ? [`${packageManager} install`] : [];
  if (envExampleFile) skeletonSteps.push(`cp ${envExampleFile} .env`);
  if (composeServices.length > 0) skeletonSteps.push(`docker compose up -d ${composeServices.join(' ')}`);
  if (scripts.includes('dev')) skeletonSteps.push(`${packageManager} dev`);

  return {
    packageManager,
    scripts,
    envExampleVars,
    envExampleFile,
    composeServices,
    dockerfilePresent,
    whitelist,
    skeletonSteps,
  };
}
