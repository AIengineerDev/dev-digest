import type { EvalCase, EvalRunGroup, EvalRunRecord } from "@devdigest/shared";

/** The `next-intl` translator, narrowed to what these helpers call. Typing it
    as a plain function loses the library's own value type and stops compiling. */
type Translate = (key: never, values?: Record<string, string | number>) => string;

/** A metric as a whole percent. The numbers are ratios; nobody reads 0.8235. */
export function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;
}

/**
 * Signed point difference against the previous run, or null when there is none.
 *
 * Null and zero are different claims — "no baseline yet" is not "unchanged" —
 * so the caller renders them differently.
 */
export function deltaPts(
  latest: EvalRunGroup | null,
  previous: EvalRunGroup | null,
  pick: (g: EvalRunGroup) => number,
): number | null {
  if (!latest || !previous) return null;
  return Math.round((pick(latest) - pick(previous)) * 100);
}

/**
 * The one error every case in a run hit, or null.
 *
 * A run where no model answered is not a measurement — it is the absence of
 * one, and rendering it as `recall 0` reads as "the agent is bad" when the real
 * answer is "the provider refused". Only returned when EVERY case failed the
 * same way: a single flaky case is a per-case failure, not a run-level one.
 */
export function runLevelError(group: EvalRunGroup | null): string | null {
  if (!group || group.runs.length === 0) return null;
  const errors = group.runs.map(
    (r) => (r.actual_output as { error?: string } | null)?.error ?? null,
  );
  if (errors.some((e) => e === null)) return null;
  const first = errors[0]!;
  return errors.every((e) => e === first) ? first : null;
}
