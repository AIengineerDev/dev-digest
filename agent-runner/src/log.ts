/**
 * One structured log line per run, written to stdout as JSON (the GitHub
 * Actions log viewer renders it as text either way, but a JSON line is
 * greppable and diffable across runs). Carries what NFR Observability
 * (`plans/15-export-to-ci.plan.md` Phase 2) names: manifest name, model,
 * file and line counts, `groundingSummary`, blocker count and exit code.
 *
 * This is the only file that writes the run's final summary line —
 * `console.error`/`console.log` elsewhere are one-off progress or failure
 * messages, not the structured record.
 */
export interface RunLogEntry {
  agent: string;
  model: string;
  message: string;
  files?: number;
  lines?: number;
  grounding?: string;
  blockers?: number;
  exitCode: number;
}

export function logRun(entry: RunLogEntry): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}
