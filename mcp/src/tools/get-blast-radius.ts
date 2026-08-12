import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { failure, type Deps } from './shared.js';

/**
 * Stub — registered so the tool surface is final now and only this body changes.
 *
 * The engine side already exists (`RepoIntelService.getBlastRadius`, which walks
 * the persistent import graph and falls back to ripgrep), but it has no HTTP
 * route yet. Wiring one is the second half of L04; until then this returns an
 * `isError` result naming the state of things, so the model stops and says so
 * rather than inventing an impact analysis.
 */
export function registerGetBlastRadius(server: McpServer, _deps: Deps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get blast radius (not implemented)',
      description:
        'NOT IMPLEMENTED YET — always fails. Intended: which symbols, callers and endpoints a set of changed files impacts.',
      inputSchema: z.object({
        repo: z.string().describe('owner/name'),
        files: z.array(z.string()).min(1).describe('Repo-relative paths'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async () =>
      failure(
        'not_implemented: blast radius ships with the second half of L04. ' +
          'Do not guess the impact — use get_findings for what the reviewers actually found.',
      ),
  );
}
