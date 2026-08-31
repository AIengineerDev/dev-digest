#!/usr/bin/env node
/**
 * The `devdigest-mcp` executable.
 *
 * Two ways in, because this package lives in two places.
 *
 * **Published to npm** — `dist/index.js` is present: an ncc bundle produced by
 * `prepublishOnly`. It has to be a bundle. `@devdigest/shared` is reached
 * through a tsconfig path alias into `../server/src/vendor/shared`, which is
 * outside this directory and therefore outside anything npm would pack, so a
 * source-only package would resolve nothing at runtime. Bundling inlines it.
 *
 * **Inside this repository** — no `dist/`: register tsx's ESM loader and run
 * the TypeScript directly. That keeps the source the only copy while working
 * on it, and matches `AGENTS.md`'s rule that this package emits no JS as part
 * of its normal build. `npm run bundle` is a publishing step, not a build step.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bundle = new URL('../dist/index.js', import.meta.url);

if (existsSync(fileURLToPath(bundle))) {
  await import(bundle.href);
} else {
  const { register } = await import('tsx/esm/api');
  register();
  await import('../src/index.ts');
}
