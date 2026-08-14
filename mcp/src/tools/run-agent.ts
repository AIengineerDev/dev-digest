import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import type { RunSummary } from '@devdigest/shared';
import { ApiError } from '../api.js';
import { formatRun } from '../format.js';
import { findAgent, guard, text, type Deps } from './shared.js';

/** Findings per run in the inline render — same cap as `get_findings`. */
const FINDINGS_CAP = 20;

/**
 * Resolves after `ms`, or immediately if `signal` is already aborted or fires
 * while waiting. Never rejects: the poll loop below decides what "aborted"
 * means, this just stops blocking it.
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function registerRunAgent(server: McpServer, { api, resolver, timing }: Deps): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run a review agent on a pull request',
      description:
        'Review a pull request and return its findings. Waits ~55s; if runs are still going it returns those that finished plus run ids for get_findings.',
      inputSchema: z.object({
        // A plain string, never `z.union([number, string])`: a union renders as
        // `anyOf` in the JSON Schema, and a host with no widget for that falls
        // back to a raw JSON editor — the MCP Inspector re-encodes the value on
        // every keystroke there, so quotes accumulate backslashes and Backspace
        // appears to do nothing. One type keeps the field a normal text input.
        pr: z.string().describe('PR number, its uuid, or a pasted PR URL'),
        repo: z.string().optional().describe('owner/name — omit if pr is a uuid'),
        agent: z.string().optional().describe('Agent name or id from list_agents; omit to run every enabled agent'),
      }),
      // Not read-only: it spends money on an LLM call and writes a run + review.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ repo, pr, agent }, ctx) =>
      guard(async () => {
        const { prId } = await resolver.prId(repo, pr);

        let target: { agentId: string } | { all: true } = { all: true };
        if (agent !== undefined) {
          const match = findAgent(await api.listAgents(), agent);
          if (!match.enabled) {
            throw new ApiError(`Agent "${match.name}" is disabled — enable it in DevDigest first.`);
          }
          target = { agentId: match.id };
        }

        const started = await api.startReview(prId, target);
        if (started.length === 0) {
          throw new ApiError('No enabled agent to run — enable one in DevDigest, or pass `agent`.');
        }

        // The server has already committed to these runs (`agent_runs` rows
        // exist) the moment startReview returns — blocking below is purely
        // this tool polling for them to finish, never a retry of the start.
        const startedIds = new Set(started.map((r) => r.run_id));
        const total = startedIds.size;
        const signal = ctx.mcpReq.signal;
        const progressToken = ctx.mcpReq._meta?.progressToken;

        const deadline = Date.now() + timing.waitMs;
        let finished = new Map<string, RunSummary>();
        let lastNotifiedCount = -1;

        while (true) {
          if (signal.aborted) {
            // The SDK discards the result once a request is cancelled — the
            // point of stopping here is to stop hammering the API, not to
            // produce a meaningful return value.
            return text('');
          }

          const runs = await api.listRuns(prId, signal);
          finished = new Map(
            runs.filter((r) => startedIds.has(r.run_id) && r.status !== 'running').map((r) => [r.run_id, r]),
          );

          if (progressToken !== undefined && finished.size !== lastNotifiedCount) {
            lastNotifiedCount = finished.size;
            await ctx.mcpReq.notify({
              method: 'notifications/progress',
              params: {
                progressToken,
                progress: finished.size,
                total,
                message: `${finished.size} of ${total} reviewers finished`,
              },
            });
          }

          if (finished.size === total) break;
          if (Date.now() >= deadline) break;
          if (signal.aborted) return text('');

          await sleep(timing.pollMs, signal);
        }

        if (signal.aborted) return text('');

        const anyFinished = finished.size > 0;
        const reviews = anyFinished ? await api.listReviews(prId, signal) : [];

        const blocks = started
          .filter((r) => finished.has(r.run_id))
          .map((r) => {
            const run = finished.get(r.run_id)!;
            const review = reviews.find((rv) => rv.run_id === r.run_id);
            const allFindings = review?.findings ?? [];
            return formatRun(run, review, allFindings.slice(0, FINDINGS_CAP), {
              total: allFindings.length,
              detail: 'compact',
            });
          });

        if (finished.size === total) {
          return text(blocks.join('\n\n'));
        }

        // The wait wall was reached with runs still in flight. This is a
        // partial result, not a failure: the review keeps running on the
        // server regardless of whether this tool call is still attached to it.
        //
        // Lead with the COUNT. A bare list of uuids under the word "still
        // running" reads as a failure — reported by a user who saw exactly that
        // and called it an error — while "0 of 5 finished" reads as progress,
        // which is what it is.
        const stillRunning = started.filter((r) => !finished.has(r.run_id)).map((r) => r.run_id);
        const secs = Math.round(timing.waitMs / 1000);
        const header =
          `${finished.size} of ${total} reviewer${total === 1 ? '' : 's'} finished within ${secs}s; ` +
          `${stillRunning.length} still running. This is not an error — the review continues on the ` +
          `server whether or not this call is still attached to it.`;
        const next =
          `Collect the rest with get_findings (pr is enough; run_id narrows it to one): ` +
          `${stillRunning.join(', ')}.` +
          // Only worth saying when the fan-out is what made it slow.
          (agent === undefined && total > 1
            ? ` To wait inline next time, pass \`agent\` and run one reviewer instead of ${total}.`
            : '');
        return text([header, ...blocks, next].join('\n\n'));
      }),
  );
}
