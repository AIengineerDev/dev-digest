#!/usr/bin/env node
/**
 * The `devdigest-mcp` executable.
 *
 * This package emits no JS — like `reviewer-core`, it is consumed as TypeScript
 * source (../AGENTS.md). Emitting is not an option here: `@devdigest/shared` is
 * reached through a tsconfig path alias into `server/src/vendor/shared`, so tsc
 * pulls those sources into the program and writes them under `dist/` too,
 * shifting every output path. Registering tsx's ESM loader in-process costs one
 * hop at startup and keeps the source the only copy.
 */
import { register } from 'tsx/esm/api';

register();
await import('../src/index.ts');
