import type { EvalCase, EvalRunRecord } from "@devdigest/shared";

/** The `next-intl` translator, narrowed to what these helpers call. Typing it
    as a plain function loses the library's own value type and stops compiling. */
type Translate = (key: never, values?: Record<string, string | number>) => string;

export function statusOf(run: EvalRunRecord | null): "pass" | "fail" | "never" {
  if (!run) return "never";
  return run.pass ? "pass" : "fail";
}

function expectations(c: EvalCase): { kind?: unknown }[] {
  return Array.isArray(c.expected_output) ? (c.expected_output as { kind?: unknown }[]) : [];
}

/** The badge: the expectation kind, or the mock's `empty []` for a pure
 *  must_not_flag case — "expects nothing" is a claim worth showing as one. */
export function expectedLabel(c: EvalCase, t: Translate): string {
  const kinds = expectations(c).map((e) => e.kind);
  if (kinds.length === 0) return t("evals.kind.unknown" as never);
  if (kinds.every((k) => k === "must_not_flag")) return "empty []";
  return kinds.includes("must_find") ? t("evals.kind.must_find" as never) : t("evals.kind.must_not_flag" as never);
}

/** `expected 1 finding, got 1` — the mock's second line. Counts, not prose:
 *  it is the one sentence that says why a row is red. */
export function resultLabel(c: EvalCase, run: EvalRunRecord | null, t: Translate): string {
  const expected = expectations(c).filter((e) => e.kind === "must_find").length;
  if (!run) return t("evals.neverRun" as never);
  const out = run.actual_output as { findings?: unknown[]; error?: string } | null;
  if (out?.error) return out.error;
  return t("evals.expectedGot" as never, { expected, got: out?.findings?.length ?? 0 });
}
