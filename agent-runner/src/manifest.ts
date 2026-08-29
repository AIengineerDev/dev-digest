import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { AgentManifest, type AgentManifest as AgentManifestType } from '@devdigest/shared';

/**
 * Parse already-read manifest YAML text into a validated `AgentManifest`.
 * Pure — no filesystem access — so it can be exercised against a fixture
 * string directly. Throws the raw `ZodError` on failure; `loadManifest`
 * turns that into the printed, non-zero-exit failure (C4).
 */
export function parseManifest(raw: string): AgentManifestType {
  const data: unknown = parseYaml(raw);
  return AgentManifest.parse(data);
}

/**
 * Load and validate `.devdigest/agents/<slug>.yaml` from the checkout.
 *
 * A Zod validation failure is never downgraded to a warning: every issue's
 * `path` and `message` is printed to stderr and the process exits non-zero
 * (C4). A caller that wants to catch this itself should use `parseManifest`
 * instead — this function is the CLI-facing one and always exits on failure.
 */
export function loadManifest(path: string): AgentManifestType {
  const raw = readFileSync(path, 'utf8');
  try {
    return parseManifest(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      console.error(`Invalid agent manifest at ${path}:`);
      for (const issue of err.issues) {
        console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw err;
  }
}
