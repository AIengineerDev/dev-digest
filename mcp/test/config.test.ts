/**
 * `loadConfig` is the whole reason env is an acceptable place for these knobs:
 * it is the only thing standing between a hand-typed host config and a value
 * that silently does not apply. These tests pin the two properties that matter
 * — a bad value stops the process, and a good one is actually used.
 */
import { describe, expect, it, vi } from 'vitest';
import { ConfigError, DEFAULT_API_URL, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults everything when the environment is empty', () => {
    expect(loadConfig({})).toEqual({
      apiUrl: DEFAULT_API_URL,
      waitMs: 55_000,
      pollMs: 2_000,
      requestTimeoutMs: 15_000,
    });
  });

  it('reads the values an operator actually set', () => {
    const config = loadConfig({
      DEVDIGEST_API_URL: 'https://devdigest.internal:8443',
      DEVDIGEST_MCP_WAIT_MS: '30000',
      DEVDIGEST_MCP_POLL_MS: '500',
      DEVDIGEST_MCP_REQUEST_TIMEOUT_MS: '4000',
    });
    expect(config).toEqual({
      apiUrl: 'https://devdigest.internal:8443',
      waitMs: 30_000,
      pollMs: 500,
      requestTimeoutMs: 4_000,
    });
  });

  it('treats a cleared or whitespace-only variable as unset', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: '', DEVDIGEST_MCP_WAIT_MS: '  ' })).toMatchObject({
      apiUrl: DEFAULT_API_URL,
      waitMs: 55_000,
    });
  });

  it('trims a value pasted with whitespace rather than rejecting it', () => {
    expect(loadConfig({ DEVDIGEST_MCP_WAIT_MS: ' 30000 ' }).waitMs).toBe(30_000);
  });

  // The regression this file exists for: every one of these used to fall back
  // to the default without a word.
  it.each([
    ['DEVDIGEST_MCP_WAIT_MS', '55s'],
    ['DEVDIGEST_MCP_WAIT_MS', '55_000'],
    ['DEVDIGEST_MCP_WAIT_MS', '-1'],
    ['DEVDIGEST_MCP_WAIT_MS', '0'],
    ['DEVDIGEST_MCP_WAIT_MS', '1.5'],
    ['DEVDIGEST_MCP_POLL_MS', 'fast'],
    ['DEVDIGEST_MCP_REQUEST_TIMEOUT_MS', 'null'],
    ['DEVDIGEST_API_URL', 'localhost:3001'],
    ['DEVDIGEST_API_URL', 'ftp://localhost:3001'],
  ])('rejects %s=%s instead of falling back to the default', (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(ConfigError);
    expect(() => loadConfig({ [name]: value })).toThrow(name);
  });

  it('names the value and the fix in the message', () => {
    expect(() => loadConfig({ DEVDIGEST_MCP_WAIT_MS: '55s' })).toThrow(/"55s"/);
    expect(() => loadConfig({ DEVDIGEST_MCP_WAIT_MS: '55s' })).toThrow(/mcp\/README\.md/);
  });

  it('reports every bad variable at once, not just the first', () => {
    try {
      loadConfig({ DEVDIGEST_MCP_WAIT_MS: 'x', DEVDIGEST_MCP_POLL_MS: 'y' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('DEVDIGEST_MCP_WAIT_MS');
      expect((err as Error).message).toContain('DEVDIGEST_MCP_POLL_MS');
    }
  });

  it('rejects a poll interval that would never fire inside the wall', () => {
    expect(() =>
      loadConfig({ DEVDIGEST_MCP_WAIT_MS: '5000', DEVDIGEST_MCP_POLL_MS: '5000' }),
    ).toThrow(/must be smaller than/);
  });

  // Advisory only: MCP_TOOL_TIMEOUT belongs to the host, and the runs survive
  // the host cutting the call either way. See `../AGENTS.md`.
  it('warns, without failing, when our wall is not under the host wall', () => {
    const onWarn = vi.fn();
    const config = loadConfig({ DEVDIGEST_MCP_WAIT_MS: '90000', MCP_TOOL_TIMEOUT: '60000' }, { onWarn });
    expect(config.waitMs).toBe(90_000);
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('MCP_TOOL_TIMEOUT'));
  });

  it('stays quiet when our wall is under the host wall', () => {
    const onWarn = vi.fn();
    loadConfig({ DEVDIGEST_MCP_WAIT_MS: '55000', MCP_TOOL_TIMEOUT: '150000' }, { onWarn });
    expect(onWarn).not.toHaveBeenCalled();
  });
});
