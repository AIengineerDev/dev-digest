import { z } from 'zod';

/** Lifecycle of a pull request as this API reports it. */
export const PrState = z.enum(['open', 'closed', 'merged']);
export type PrState = z.infer<typeof PrState>;

export const PrSummary = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  state: PrState,
  head_sha: z.string(),
  last_reviewed_sha: z.string().nullable(),
  additions: z.number().int(),
  deletions: z.number().int(),
  updated_at: z.string(),
  draft: z.boolean().optional(),
});
export type PrSummary = z.infer<typeof PrSummary>;

export const PrListQuery = z.object({
  state: PrState.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type PrListQuery = z.infer<typeof PrListQuery>;

export const PrListResponse = z.object({
  items: z.array(PrSummary),
  next_cursor: z.string().nullable(),
});
export type PrListResponse = z.infer<typeof PrListResponse>;

export const PrReviewer = z.object({
  login: z.string(),
  state: z.enum(['requested', 'approved', 'changes_requested']),
});
export type PrReviewer = z.infer<typeof PrReviewer>;

export const PrReviewerListResponse = z.object({
  items: z.array(PrReviewer),
});
export type PrReviewerListResponse = z.infer<typeof PrReviewerListResponse>;
