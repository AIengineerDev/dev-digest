import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import type { RunSummary } from '@devdigest/shared';
import { ApiError } from '../api.js';
import { atOrAbove, formatRun, type SeverityName } from '../format.js';
import { guard, text, type Deps } from './shared.js';

/**
 * Which runs to report when the caller did not name one: the newest run per
 * agent, among the runs stamped with the newest head.
 *
 * Not "the newest run" — `run_agent_on_pr` without an `agent` fans out
 * to every enabled reviewer, and showing one of them would read as the whole
 * answer. But not "every run at this head" either: `head_sha` only changes when
 * the PR is pushed to, so re-reviewing the same commit piles pass on pass under
 * one head. Measured on the seeded PR after three passes: 11 runs, up to 3 per
 * agent, all one `head_sha` — the default path of the package's compact tool
 * returning its largest answer, growing without bound.
 *
 * `listRunsForPull` orders newest-first, so keeping the first run seen per
 * `agent_id` is "the latest pass" as a person means it. Runs with a null
 * `agent_id` are keyed by `run_id` so a deleted agent's run is never folded into
 * someone else's. Falls back to the single newest run for rows written before
 * `head_sha` existed (it is nullable by contract).
 */
function latestBatch(runs: RunSummary[]): RunSummary[] {
  const newest = runs[0];
  if (!newest) return [];
  if (!newest.head_sha) return [newest];

  const seen = new Set<string>();
  return runs
    .filter((r) => r.head_sha === newest.head_sha)
    .filter((r) => {
      const key = r.agent_id ?? `run:${r.run_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function registerGetFindings(server: McpServer, { api, resolver }: Deps): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Get review findings',
      description:
        "Read an existing review: status, verdict, score, findings. Use to collect a run that timed out.",
      inputSchema: z.object({
        // Plain string, not a union — see the note in `run-agent.ts`.
        pr: z.string().describe('PR number, its uuid, or a pasted PR URL'),
        repo: z.string().optional().describe('owner/name — omit if pr is a uuid'),
        run_id: z.string().optional().describe('From run_agent_on_pr; omit for the latest review pass'),
        min_severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']).optional(),
        limit: z.number().int().min(1).max(100).optional().describe('Findings per run, default 20'),
        detail: z.enum(['compact', 'full']).optional().describe('full adds rationale and suggestion'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ repo, pr, run_id, min_severity, limit, detail }) =>
      guard(async () => {
        const { prId } = await resolver.prId(repo, pr);
        const runs = await api.listRuns(prId);

        let selected: RunSummary[];
        if (run_id !== undefined) {
          const one = runs.find((r) => r.run_id === run_id);
          if (!one) {
            throw new ApiError(
              `No run ${run_id} on this PR. Runs on it: ${
                runs.map((r) => r.run_id).slice(0, 10).join(', ') || '(none)'
              }`,
            );
          }
          selected = [one];
        } else {
          selected = latestBatch(runs);
        }
        if (selected.length === 0) {
          const addressed = repo ? `${repo}#${pr}` : pr;
          return text(`No review has been run on ${addressed}. Start one with run_agent_on_pr.`);
        }

        // Only pay for the reviews call when something can actually be in it.
        const anyFinished = selected.some((r) => r.status === 'done');
        const reviews = anyFinished ? await api.listReviews(prId) : [];

        const floor: SeverityName = min_severity ?? 'SUGGESTION';
        const cap = limit ?? 20;
        const blocks = selected.map((run) => {
          const review = reviews.find((r) => r.run_id === run.run_id);
          const matching = (review?.findings ?? []).filter((f) => atOrAbove(f.severity, floor));
          return formatRun(run, review, matching.slice(0, cap), {
            total: matching.length,
            detail: detail ?? 'compact',
          });
        });
        return text(blocks.join('\n\n'));
      }),
  );
}
