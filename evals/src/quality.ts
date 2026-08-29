/**
 * The zero level: everything that can be checked about a skill or an agent
 * WITHOUT spending a token. It is the only eval gate that is safe to make
 * blocking in CI, because it is deterministic, free and fast — the model runs
 * publish a report and compare against a baseline instead.
 *
 * It answers structural questions only. Whether a skill is any good is what
 * `eval:skills` measures; whether it is well-formed is here.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(here, '..', '..');

export interface Issue {
  level: 'error' | 'warning';
  where: string;
  what: string;
}

interface Frontmatter {
  name?: string;
  description?: string;
  raw: string;
  body: string;
}

/** Enough YAML for `name:` and `description:` — the only two keys that gate. */
export function frontmatter(text: string): Frontmatter | null {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return null;
  const raw = m[1] ?? '';
  const read = (key: string): string | undefined => {
    const line = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(raw);
    return line?.[1]?.trim().replace(/^["']|["']$/g, '');
  };
  return { name: read('name'), description: read('description'), raw, body: text.slice(m[0].length) };
}

/** Markdown and bare-path references that point at a file in this repo. */
function internalLinks(body: string, from: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\[[^\]]*\]\(([^)#\s]+)\)/g)) {
    const href = m[1] ?? '';
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    out.add(href);
  }
  // `references/palette.md`-style pointers inside backticks, relative to the
  // skill directory. A skill that names a file it does not ship is a dead end
  // for the agent that follows it.
  for (const m of body.matchAll(/`([\w./-]+\.(?:md|ts|tsx|json|sh|cjs|mjs))`/g)) {
    const p = m[1] ?? '';
    if (!p.includes('/')) continue;
    if (existsSync(join(dirname(from), p))) out.add(p);
    else if (existsSync(join(REPO, p))) out.add(`::repo::${p}`);
  }
  return [...out];
}

function checkLinks(file: string, body: string, issues: Issue[]): void {
  for (const link of internalLinks(body, file)) {
    const repoRooted = link.startsWith('::repo::');
    const target = repoRooted ? join(REPO, link.slice(8)) : join(dirname(file), link);
    if (!existsSync(target)) {
      issues.push({
        level: 'error',
        where: relative(REPO, file),
        what: `link points at nothing: ${repoRooted ? link.slice(8) : link}`,
      });
    }
  }
}

/** A skill has an eval suite if EITHER harness covers it. */
export function hasEvalCoverage(name: string): boolean {
  const abHarness = [
    join(REPO, '.claude', 'skills', name, 'evals', 'expected.json'),
    join(REPO, 'skills', name, 'evals', 'expected.json'),
  ];
  const sessionHarness = join(REPO, 'evals', 'skills', name, `${name}.cases.ts`);
  return [...abHarness, sessionHarness].some((p) => existsSync(p));
}

/**
 * `.claude/skills/**` — Claude Code skills. The unit is `SKILL.md`, and a
 * directory without one is not a skill: the harness never loads it, so it is
 * reported as a WARNING ("notes in the skills folder") rather than an error.
 * Making the blocking gate red over two pre-existing stubs would only teach
 * people to stop reading it.
 */
export function checkSkills(): Issue[] {
  const issues: Issue[] = [];
  const root = join(REPO, '.claude', 'skills');
  if (!existsSync(root)) return issues;
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) continue;
    const file = join(dir, 'SKILL.md');
    const where = relative(REPO, file);
    if (!existsSync(file)) {
      issues.push({
        level: 'warning',
        where: relative(REPO, dir),
        what: 'no SKILL.md — Claude Code will never load this directory as a skill',
      });
      continue;
    }
    const fm = frontmatter(readFileSync(file, 'utf8'));
    if (!fm) {
      issues.push({ level: 'error', where, what: 'no YAML frontmatter' });
      continue;
    }
    if (!fm.name) issues.push({ level: 'error', where, what: 'frontmatter has no `name`' });
    if (!fm.description) issues.push({ level: 'error', where, what: 'frontmatter has no `description`' });
    if (fm.name && fm.name !== name) {
      issues.push({ level: 'error', where, what: `name \`${fm.name}\` ≠ directory \`${name}\`` });
    }
    // The description is the ONLY thing the model sees when deciding whether to
    // activate. One that does not say when to use the skill cannot route, and
    // `eval:workflow`'s activation cases are what prove it does.
    if (fm.description && fm.description.length < 40) {
      issues.push({ level: 'error', where, what: 'description too short to route on (<40 chars)' });
    }
    if (fm.body.trim().length < 200) {
      issues.push({ level: 'error', where, what: 'SKILL.md body is a stub (<200 chars)' });
    }
    if (!/^#\s+\S/m.test(fm.body)) {
      issues.push({ level: 'warning', where, what: 'no H1 heading in the body' });
    }
    checkLinks(file, fm.body, issues);
    if (!hasEvalCoverage(name)) {
      // Warning, not error: the skills that predate the harness would hold the
      // gate red forever. A NEW skill should arrive with its cases, and this
      // line is what makes the gap visible instead of invisible.
      issues.push({ level: 'warning', where, what: 'no eval coverage (no cases.ts and no expected.json)' });
    }
  }
  return issues;
}

/**
 * `skills/**` — PRODUCT skill data, an unrelated system that shares a word:
 * bodies of text the application manages for its users. There is no SKILL.md
 * here by design, so it is checked for the only two things it must have — a
 * README that says what it is, and, when it ships an eval suite, a readable
 * answer key.
 */
export function checkProductSkills(): Issue[] {
  const issues: Issue[] = [];
  const root = join(REPO, 'skills');
  if (!existsSync(root)) return issues;
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) continue;
    const readme = join(dir, 'README.md');
    if (!existsSync(readme)) {
      issues.push({ level: 'error', where: relative(REPO, dir), what: 'no README.md' });
    } else {
      checkLinks(readme, readFileSync(readme, 'utf8'), issues);
    }
    const expected = join(dir, 'evals', 'expected.json');
    if (existsSync(expected)) {
      try {
        JSON.parse(readFileSync(expected, 'utf8'));
      } catch (err) {
        issues.push({
          level: 'error',
          where: relative(REPO, expected),
          what: `unparseable answer key: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }
  return issues;
}

export function checkAgents(): Issue[] {
  const issues: Issue[] = [];
  const dir = join(REPO, '.claude', 'agents');
  if (!existsSync(dir)) return issues;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md') || entry === 'README.md') continue;
    const file = join(dir, entry);
    const where = relative(REPO, file);
    const fm = frontmatter(readFileSync(file, 'utf8'));
    if (!fm) {
      issues.push({ level: 'error', where, what: 'no YAML frontmatter' });
      continue;
    }
    const expected = entry.replace(/\.md$/, '');
    if (!fm.name) issues.push({ level: 'error', where, what: 'frontmatter has no `name`' });
    else if (fm.name !== expected) {
      issues.push({ level: 'error', where, what: `name \`${fm.name}\` ≠ filename \`${expected}\`` });
    }
    if (!fm.description) {
      issues.push({ level: 'error', where, what: 'frontmatter has no `description` — nothing can dispatch it' });
    }
    checkLinks(file, fm.body, issues);
  }
  return issues;
}

export function checkAll(): Issue[] {
  return [...checkSkills(), ...checkProductSkills(), ...checkAgents()];
}
