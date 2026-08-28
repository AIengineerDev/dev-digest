import { z } from 'zod';

/** Where a review run is in its lifecycle. */
export const RunStatus = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out']);
export type RunStatus = z.infer<typeof RunStatus>;

export const RunSummary = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_name: z.string(),
  status: RunStatus,
  cost_usd: z.number(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;

export const RunListResponse = z.object({
  items: z.array(RunSummary),
  next_cursor: z.string().nullable(),
});
export type RunListResponse = z.infer<typeof RunListResponse>;
