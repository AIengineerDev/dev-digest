import { z } from 'zod';

/**
 * `TourAnnotations` — the model-facing schema (R7's exactly-one-call
 * response). Module-local, NOT in `@devdigest/shared`: nothing outside the
 * server ever parses it, and putting a prompt's shape on the client's wire
 * is how it becomes load-bearing (`plans/12-onboarding-generator.plan.md`
 * "Contract changes").
 *
 * Narrower than `TourRecord` on purpose:
 * - `first_tasks[]` carries `candidate_id`, `title`, `why` and NO
 *   `difficulty` field at all — R9's "any model difficulty is discarded" is
 *   structural, not a filter someone can delete later.
 * - `guided_reading[]` is a `path → why` shape that CANNOT express an order
 *   (R6, C17) — the model has no field to put a position in.
 * - every top-level key is nullable (`onboarding.system.md:5,12` — "a key
 *   that has nothing to say may be null").
 */
export const TourAnnotations = z.object({
  architecture: z
    .object({
      body: z.string().nullable(),
      dirs: z.array(z.object({ path: z.string(), note: z.string().nullable() })),
    })
    .nullable(),
  critical_paths: z.array(z.object({ chain_id: z.string(), why: z.string().nullable() })).nullable(),
  how_to_run: z
    .object({
      body: z.string().nullable(),
      steps: z.array(z.object({ command: z.string(), why: z.string().nullable() })),
    })
    .nullable(),
  guided_reading: z.array(z.object({ path: z.string(), why: z.string().nullable() })).nullable(),
  first_tasks: z
    .array(z.object({ candidate_id: z.string(), title: z.string(), why: z.string().nullable() }))
    .nullable(),
});
export type TourAnnotations = z.infer<typeof TourAnnotations>;
