/**
 * buildServer — the whole MCP surface, with no transport attached.
 *
 * Keeping `connect()` out of here is what lets the tests drive the real server
 * through an in-memory client pair; `index.ts` is the only file that knows about
 * stdio.
 *
 * Nothing here touches the network at construction time: a session that never
 * calls a tool makes zero HTTP requests.
 */
import { McpServer } from '@modelcontextprotocol/server';
import { createApi, type DevDigestApi } from './api.js';
import { DEFAULT_TIMING, type Timing } from './constants.js';
import { createResolver } from './resolve.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgent } from './tools/run-agent.js';
import type { Deps } from './tools/shared.js';

export const SERVER_NAME = 'devdigest';
export const SERVER_VERSION = '0.1.0';

export function buildServer(api: DevDigestApi = createApi(), timing: Timing = DEFAULT_TIMING): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const deps: Deps = { api, resolver: createResolver(api), timing };

  // Five tools, no resources and no prompts. Everything registered here is
  // pasted into the context window of every new chat before the user types, so
  // the list is short by design and each description is one line — see
  // ../AGENTS.md "Token budget".
  registerListAgents(server, deps);
  registerRunAgent(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);

  return server;
}
