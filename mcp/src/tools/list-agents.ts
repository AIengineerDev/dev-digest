import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import { formatAgents } from '../format.js';
import { guard, text, type Deps } from './shared.js';

export function registerListAgents(server: McpServer, { api }: Deps): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List review agents',
      description:
        'DevDigest review agents: id, name, provider/model, strategy, CI gate.',
      inputSchema: z.object({
        include_disabled: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ include_disabled }) =>
      guard(async () => {
        const agents = await api.listAgents();
        return text(formatAgents(include_disabled ? agents : agents.filter((a) => a.enabled)));
      }),
  );
}
