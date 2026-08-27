import { z } from 'zod';

/** How much a finding should worry the person reading it. */
export const Severity = z.enum(['critical', 'warning', 'nit']);
export type Severity = z.infer<typeof Severity>;

export const Finding = z.object({
  id: z.string(),
  run_id: z.string(),
  severity: Severity,
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
});
export type Finding = z.infer<typeof Finding>;

export const FindingListQuery = z.object({
  agentId: z.string(),
  severity: Severity.optional(),
  cursor: z.string().optional(),
});
export type FindingListQuery = z.infer<typeof FindingListQuery>;

export const FindingListResponse = z.object({
  items: z.array(Finding),
  next_cursor: z.string().nullable(),
});
export type FindingListResponse = z.infer<typeof FindingListResponse>;
