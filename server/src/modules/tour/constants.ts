/**
 * Constants for the onboarding tour module (specs/12-onboarding-generator.md).
 * Nothing here is a Zod schema — those live in `@devdigest/shared` (the wire
 * contract) or `./schemas.ts` (the model-facing `TourAnnotations` shape).
 */

/** R6's cache-key component. Bump when the system/user prompt shape changes
 *  in a way that should invalidate every cached tour. */
export const TOUR_PROMPT_VERSION = 'v1';

export const TOUR_SCHEMA_NAME = 'TourAnnotations';

export const TOUR_MODEL_MAX_TOKENS = 2_600;
export const TOUR_MODEL_TIMEOUT_MS = 45_000;

/**
 * Correction C-4 (brief) / R8 here: exactly ONE `completeStructured`
 * invocation per generation. A malformed or truncated response degrades to
 * the skeleton (`error: 'malformed_response'`); it is never repaired by a
 * retry, which would be a second billed request R14's ceiling never budgeted.
 */
export const TOUR_MODEL_MAX_RETRIES = 0;

/**
 * R14's pre-flight ceiling, measured as
 * `count(system + user + JSON.stringify(toJsonSchema(schema, name).schema))`.
 *
 * Deliberately carries NO billing safety factor (spec Q8's stated default,
 * `specs/12-onboarding-generator.md:500`), unlike the brief's shipped
 * `BRIEF_BILLING_SAFETY_FACTOR = 2` (`modules/brief/constants.ts:33`,
 * `server/INSIGHTS.md:304-318`). That means this number is a PRE-FLIGHT
 * FLOOR, not a billed ceiling: the brief's own measurement found the
 * counted-plus-schema total still undercounts the real bill by roughly 1.9x
 * on a comparable structured-output schema. Retune this constant, don't
 * pretend it is exact — J1's manual step is what puts a real ratio next to
 * this number for a five-section schema.
 */
export const TOUR_BUDGET_CEILING = 12_000;

/** Nodes the architecture diagram may draw before it stops being a summary.
 *  Measured: a 512-file repo aggregated to depth 3 yields ~15 directories, so
 *  this is headroom, not a routine truncation. Before the depth-3 fold the
 *  same repo drew 116 nodes and 250 edges. */
export const MAX_DIAGRAM_NODES = 24;
