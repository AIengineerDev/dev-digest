/**
 * The bits every tool file needs: what it is handed, and how a result leaves.
 */
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { DevDigestApi } from '../api.js';
import type { Timing } from '../constants.js';
import type { Resolver } from '../resolve.js';

export interface Deps {
  api: DevDigestApi;
  resolver: Resolver;
  timing: Timing;
}

/**
 * The SDK's own result type. A hand-rolled interface does not work here: the
 * SDK's result union carries an index signature, and an `interface` is never
 * assignable to one — TypeScript then reports the mismatch against whichever
 * union member it tried last, which is `InputRequiredResult` and deeply
 * confusing.
 */
export type ToolResult = CallToolResult;

export const text = (body: string): ToolResult => ({ content: [{ type: 'text', text: body }] });

export const failure = (body: string): ToolResult => ({
  content: [{ type: 'text', text: body }],
  isError: true,
});

/**
 * Turn a thrown error into an `isError` result instead of a protocol-level
 * failure. `ApiError` messages are already written for the model (they name the
 * fix), so they pass through verbatim; anything else is unexpected and says so.
 */
export async function guard(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (err) {
    const e = err as Error;
    return failure(e.name === 'ApiError' ? e.message : `DevDigest MCP failed: ${e.message}`);
  }
}
