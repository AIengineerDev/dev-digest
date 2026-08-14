import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { formatBlast } from '../format.js';
import { guard, text, type Deps } from './shared.js';

/**
 * Blast radius for a PR, from `GET /pulls/:id/blast`.
 *
 * Takes the **pull request**, not a file list, and that is the whole ergonomic
 * point: the server already knows which files the PR touches, so a model that
 * can name the PR needs nothing else. An explicit `files[]` — the shape this
 * tool was stubbed with — would make the caller reconstruct the diff first, and
 * every reconstruction is a chance to analyse the wrong change.
 *
 * No model call: the answer comes from the persistent code index.
 */
export function registerGetBlastRadius(server: McpServer, { api, resolver }: Deps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get blast radius',
      description:
        'What a PR reaches: changed symbols, who calls them, and the endpoints and crons downstream. From the code index — no review needed.',
      inputSchema: z.object({
        pr: z.union([z.number().int().positive(), z.string()]).describe('PR number, or its uuid'),
        repo: z.string().optional().describe('owner/name — omit if pr is a uuid'),
        limit: z.number().int().min(1).max(60).optional().describe('Symbols, default 15'),
        detail: z.enum(['compact', 'full']).optional().describe('full lists each caller and endpoint'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ pr, repo, limit, detail }) =>
      guard(async () => {
        const { prId } = await resolver.prId(repo, pr);
        const blast = await api.getBlastRadius(prId);
        return text(formatBlast(blast, { detail: detail ?? 'compact', limit: limit ?? 15 }));
      }),
  );
}
