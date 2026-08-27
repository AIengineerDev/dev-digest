import { z } from 'zod';

export const PrState = z.enum(['open', 'closed', 'merged']);

export const PrSummary = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  state: PrState,
  head_sha: z.string(),
  updated_at: z.string(),
});
export type PrSummary = z.infer<typeof PrSummary>;
