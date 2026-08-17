/**
 * Proves the shipped binary boots over stdio for real: spawns
 * `node bin/devdigest-mcp.mjs` as a child process (no in-process client, no
 * mocked transport) and drives it through the exact initialize → initialized
 * → tools/list sequence documented at ../README.md:74-79.
 *
 * Covers what the in-process client harness in tools.test.ts cannot: that
 * stdout carries nothing but the protocol (practice 11, mcp/AGENTS.md:33-34)
 * and that `buildServer()` makes zero HTTP calls at construction — proven here
 * by running with no API listening on :3001 at all (practice 12,
 * mcp/src/server.ts:8-9).
 */
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(HERE, '..', 'bin', 'devdigest-mcp.mjs');

interface Boot {
  stdout: string;
  stderr: string;
}

function bootAndListTools(): Promise<Boot> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN], {
      cwd: path.join(HERE, '..'),
      env: {
        ...process.env,
        // No API on :3001 in this test run — construction must not touch it.
        DEVDIGEST_API_URL: 'http://127.0.0.1:1', // reserved, unroutable port
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);

    const lines = [
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2026-07-28',
          capabilities: {},
          clientInfo: { name: 'probe', version: '0' },
        },
      }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    ];
    child.stdin.write(lines.join('\n') + '\n');
    child.stdin.end();

    child.on('close', () => {
      resolve({ stdout, stderr });
    });
  });
}

describe('the shipped binary', () => {
  it(
    'boots over stdio, keeps stdout protocol-only, and lists the five tools with no API running',
    async () => {
      const { stdout } = await bootAndListTools();

      const nonEmptyLines = stdout.split('\n').filter((l) => l.trim().length > 0);
      expect(nonEmptyLines.length).toBeGreaterThan(0);

      const messages = nonEmptyLines.map((line) => {
        // A stray console.log would land here and fail to parse as JSON-RPC.
        const parsed: unknown = JSON.parse(line);
        expect((parsed as { jsonrpc?: string }).jsonrpc).toBe('2.0');
        return parsed as { id?: number; result?: unknown };
      });

      const toolsListResponse = messages.find((m) => m.id === 2) as
        | { result: { tools: { name: string }[] } }
        | undefined;
      expect(toolsListResponse).toBeDefined();
      const names = toolsListResponse!.result.tools.map((t) => t.name).sort();
      expect(names).toEqual(
        ['get_blast_radius', 'get_conventions', 'get_findings', 'list_agents', 'run_agent_on_pr'].sort(),
      );
    },
    15_000,
  );
});
