import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { formatConventions } from '../format.js';
import { guard, text, type Deps } from './shared.js';

export function registerGetConventions(server: McpServer, { api, resolver }: Deps): void {
  server.registerTool(
    'get_conventions',
    {
      title: 'Get repository conventions',
      description:
        "A repo's house rules mined from its own code, each with the file and line evidencing it. Read before writing code for it.",
      inputSchema: z.object({
        repo: z.string().describe('owner/name, or the repo uuid'),
        // Default is `accepted`: pending candidates are unreviewed model output
        // and rejected ones were turned down on purpose — neither is a house rule.
        status: z.enum(['accepted', 'pending', 'rejected']).optional(),
        category: z
          .enum([
            'naming',
            'structure',
            'error-handling',
            'testing',
            'typing',
            'api',
            'async',
            'logging',
            'imports',
            'security',
          ])
          .optional(),
        limit: z.number().int().min(1).max(200).optional().describe('Default 30'),
        detail: z.enum(['compact', 'full']).optional().describe('full adds rationale and the evidence snippet'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ repo, status, category, limit, detail }) =>
      guard(async () => {
        const repoId = await resolver.repoId(repo);
        const all = await api.listConventions(repoId, status ?? 'accepted');
        const matching = category ? all.filter((c) => c.category === category) : all;
        const cap = limit ?? 30;
        return text(
          formatConventions(matching.slice(0, cap), {
            total: matching.length,
            detail: detail ?? 'compact',
          }),
        );
      }),
  );
}
