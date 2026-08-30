import type { CiFailOn } from "@devdigest/shared";

/**
 * CI gate policy options — a deliberate duplicate of `ConfigTab/constants.ts`'s
 * `CI_FAIL_ON_VALUES`. `ConfigTab` already renders this control and the plan
 * for spec 15 keeps it there unmodified (both write the same
 * `agents.ci_fail_on` field through `useUpdateAgent`); a four-value array is
 * cheaper to duplicate than to widen `ConfigTab`'s scope for.
 */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];
