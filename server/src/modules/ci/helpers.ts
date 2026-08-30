/**
 * Pure generation logic for the ci module — slugs, the agent manifest YAML,
 * skill file bodies, and the target-repo split. No filesystem, no adapter, no
 * database (`helpers-are-pure`, `.dependency-cruiser.cjs:35`).
 *
 * Determinism matters here more than in most helpers: nothing below may embed
 * a timestamp, a uuid or an unsorted map iteration order, because A3 requires
 * the preview bytes and the Install bytes to be byte-identical for the same
 * agent — Install regenerates rather than trusting client-sent bytes.
 */
import type { AgentManifest } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';

/** One linked skill, narrowed to what generation needs. */
export interface SkillForCi {
  name: string;
  body: string;
}

/**
 * Stable, filename-safe slug for a skill or agent name. Reimplemented rather
 * than importing `conventions/helpers.ts#slugifyRule` — `no-cross-module-
 * internals` (`.dependency-cruiser.cjs:70`) forbids it, and the two slugifiers
 * do not need to agree: this one keeps the whole name (no 6-word truncation),
 * because a skill's identity is its name, not a rule heading.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Assign one slug per name, in the given order, with `-2`/`-3` suffixes on
 * collision. Throws `ValidationError` naming the offending skill when a name
 * slugifies to the empty string (C7) — never silently drops it or emits a
 * path that could escape `.devdigest/skills/`.
 */
export function uniqueSlugs(names: string[]): string[] {
  const counts = new Map<string, number>();
  return names.map((name) => {
    const base = slugify(name);
    if (base === '') {
      throw new ValidationError(
        `Skill "${name}" has no safe slug (its name contains no letters or digits) — rename it before exporting.`,
        { skill: name },
      );
    }
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
}

/** A YAML double-quoted scalar, safe for any string (control chars, quotes,
 *  colons, unicode) — `JSON.stringify` produces valid YAML flow-scalar syntax
 *  for these characters, which is simpler and equally deterministic to a
 *  hand-rolled YAML escaper. */
function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

/** A YAML block literal (`key: |`) — avoids ever having to escape the body
 *  text, which for a system prompt can contain quotes, colons and newlines. */
function yamlBlockLiteral(key: string, text: string): string {
  const lines = text.split('\n').map((line) => (line.length ? `  ${line}` : ''));
  return [`${key}: |`, ...lines].join('\n');
}

/**
 * Render an `AgentManifest` as the YAML the runner parses with the same Zod
 * schema (Decision 3 — one schema, so the two ends cannot drift). Every field
 * is written in a fixed order; `skills` holds exactly the slugs the caller
 * resolved.
 */
export function agentYaml(manifest: AgentManifest): string {
  const skillsBlock =
    manifest.skills.length === 0
      ? 'skills: []'
      : ['skills:', ...manifest.skills.map((s) => `  - ${yamlScalar(s)}`)].join('\n');
  return (
    [
      `name: ${yamlScalar(manifest.name)}`,
      `provider: ${manifest.provider}`,
      `model: ${yamlScalar(manifest.model)}`,
      yamlBlockLiteral('system_prompt', manifest.system_prompt),
      skillsBlock,
      `strategy: ${manifest.strategy}`,
      `ci_fail_on: ${manifest.ci_fail_on}`,
    ].join('\n') + '\n'
  );
}

/** A skill's exported body — verbatim, with exactly one trailing newline. */
export function skillFile(skill: SkillForCi): string {
  return skill.body.endsWith('\n') ? skill.body : `${skill.body}\n`;
}

/** Split `"owner/name"` into its parts for `RepoRef`. Throws `ValidationError`
 *  on anything else — a bare repo name, a URL, or an empty string. */
export function parseOwnerRepo(repo: string): { owner: string; name: string } {
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ValidationError(`"${repo}" is not a valid "owner/name" repository.`, { repo });
  }
  return { owner: parts[0], name: parts[1] };
}
