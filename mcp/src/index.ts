#!/usr/bin/env node
/**
 * devdigest-mcp — stdio entrypoint.
 *
 * stdout belongs to the MCP protocol: anything else written there corrupts the
 * stream and the host drops the connection. Every diagnostic below therefore
 * goes to stderr, which hosts surface as server logs.
 */
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  console.error('devdigest-mcp failed to start:', err);
  process.exit(1);
});
