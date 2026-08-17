#!/usr/bin/env node
/**
 * devdigest-mcp — stdio entrypoint.
 *
 * stdout belongs to the MCP protocol: anything else written there corrupts the
 * stream and the host drops the connection. Every diagnostic below therefore
 * goes to stderr, which hosts surface as server logs.
 */
import { ConfigError, loadConfig } from './config.js';

async function main(): Promise<void> {
  // Validated before the server module graph is loaded, and by dynamic import
  // so that a `ConfigError` arrives here as a value we can print, rather than
  // as an exception thrown while evaluating a static import — which the host
  // would show as a stack trace over the one line that names the fix.
  loadConfig(process.env, { onWarn: (message) => console.error(`devdigest-mcp: ${message}`) });

  const [{ buildServer }, { StdioServerTransport }] = await Promise.all([
    import('./server.js'),
    import('@modelcontextprotocol/server/stdio'),
  ]);

  const server = buildServer();
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    console.error(`devdigest-mcp: ${err.message}`);
  } else {
    console.error('devdigest-mcp failed to start:', err);
  }
  process.exit(1);
});
