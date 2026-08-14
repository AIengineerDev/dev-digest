/**
 * Compact renderers — where this server's runtime token cost is actually
 * decided.
 *
 * The rule everywhere below: emit the fields a reviewer needs to make the next
 * decision, one line per row, and nothing else. `detail: 'full'` opts back into
 * the prose. Echoing the API's JSON would cost several times more for the same
 * information; a truncated list always ends with `more()` so a cap is never
 * mistaken for "that was everything".
 */
import type {
  Agent,
  BlastRadius,
  Convention,
  FindingRecord,
  ReviewRecord,
  RunSummary,
} from '@devdigest/shared';

/** Trailer for a capped list. Empty when nothing was dropped. */
export function more(total: number, shown: number): string[] {
  return total > shown ? [`… +${total - shown} more — raise \`limit\` to see them`] : [];
}

export function formatAgents(agents: Agent[]): string {
  if (agents.length === 0) return 'No agents configured.';
  // `system_prompt` is deliberately absent: it is kilobytes per agent and the
  // model is choosing which reviewer to run, not auditing how it is worded.
  //
  // The id IS here — 36 chars a piece — because `run_agent_on_pr` accepts an id
  // as well as a name, and a hand-driven Inspector session has nowhere else to
  // get one. Without it the documented list_agents → run_agent_on_pr handoff
  // only works for callers that happen to prefer names.
  return agents
    .map((a) => {
      const flags = [a.enabled ? null : 'disabled', a.repo_intel ? null : 'no-repo-intel'].filter(Boolean);
      return (
        `${a.name} · ${a.id} · ${a.provider}/${a.model} · ${a.strategy} · gate:${a.ci_fail_on}` +
        (flags.length > 0 ? ` · ${flags.join(' ')}` : '')
      );
    })
    .join('\n');
}

const SEVERITY_RANK = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 } as const;
export type SeverityName = keyof typeof SEVERITY_RANK;

export function atOrAbove(severity: string, floor: SeverityName): boolean {
  const rank = SEVERITY_RANK[severity as SeverityName];
  return rank !== undefined && rank >= SEVERITY_RANK[floor];
}

function formatFinding(f: FindingRecord, detail: 'compact' | 'full'): string {
  const head = `${f.severity} ${f.category} ${f.file}:${f.start_line}${
    f.end_line > f.start_line ? `-${f.end_line}` : ''
  } — ${f.title}`;
  if (detail === 'compact') return head;
  const body = [f.rationale, f.suggestion ? `suggestion: ${f.suggestion}` : null].filter(Boolean);
  return [head, ...body.map((line) => `  ${String(line).replace(/\n/g, '\n  ')}`)].join('\n');
}

/**
 * A run and its review, rendered together. The run row carries the status —
 * a review that does not exist yet is `running`, not an error, and saying so
 * is what stops the model from concluding the PR is clean.
 */
export function formatRun(
  run: RunSummary,
  review: ReviewRecord | undefined,
  findings: FindingRecord[],
  opts: { total: number; detail: 'compact' | 'full' },
): string {
  const header = `run ${run.run_id} · ${run.agent_name ?? 'unknown agent'} · status ${run.status ?? 'unknown'}`;
  if (run.status === 'running') {
    return `${header}\nStill running — call get_findings again in a few seconds.`;
  }
  if (run.status === 'failed' || run.status === 'cancelled') {
    return `${header}${run.error ? `\n${run.error}` : ''}`;
  }
  if (!review) {
    return `${header}\nThe run finished but produced no review — check the run trace in the DevDigest UI.`;
  }
  const meta = `verdict ${review.verdict ?? 'n/a'} · score ${review.score ?? 'n/a'} · ${
    review.model ?? 'unknown model'
  }`;
  const body =
    findings.length === 0
      ? ['No findings at this severity.']
      : findings.map((f) => formatFinding(f, opts.detail));
  return [
    header,
    meta,
    ...(review.summary ? [review.summary] : []),
    '',
    ...body,
    ...more(opts.total, findings.length),
  ].join('\n');
}

export function formatConventions(
  conventions: Convention[],
  opts: { total: number; detail: 'compact' | 'full' },
): string {
  if (conventions.length === 0) {
    return 'No conventions match. Extract them first in the DevDigest UI (Conventions → Extract).';
  }
  const lines = conventions.map((c) => {
    const head = `${c.category} — ${c.rule} (${c.evidence_path}:${c.evidence_line})`;
    if (opts.detail === 'compact') return head;
    const extra = [c.rationale ? `why: ${c.rationale}` : null, `evidence: ${c.evidence_snippet}`].filter(
      Boolean,
    );
    return [head, ...extra.map((l) => `  ${l}`)].join('\n');
  });
  return [...lines, ...more(opts.total, conventions.length)].join('\n');
}

/**
 * Blast radius, one changed symbol per block.
 *
 * The summary goes FIRST and always: on a degraded index it is the only thing
 * separating "nothing calls this" from "the index could not say", and a model
 * that reads an empty caller list without it will report the change as safe.
 */
export function formatBlast(
  blast: BlastRadius,
  opts: { detail: 'compact' | 'full'; limit: number },
): string {
  if (blast.changed_symbols.length === 0 && blast.downstream.length === 0) return blast.summary;

  const shown = blast.downstream.slice(0, opts.limit);
  const fileOf = new Map(blast.changed_symbols.map((s) => [s.name, s.file]));

  const blocks = shown.map((d) => {
    const head = `${d.symbol} (${fileOf.get(d.symbol) ?? 'unknown file'}) · ${d.callers.length} callers`;
    if (opts.detail === 'compact') {
      // Endpoints stay even in compact form: "which routes can break" is the
      // question the tool is called to answer, and it is one short line.
      const endpoints = d.endpoints_affected.length > 0 ? ` · ${d.endpoints_affected.join(', ')}` : '';
      return `${head}${endpoints}`;
    }
    const lines = [
      ...d.callers.map((c) => `  ${c.name} — ${c.file}:${c.line}`),
      ...d.endpoints_affected.map((e) => `  endpoint: ${e}`),
      ...d.crons_affected.map((c) => `  cron: ${c}`),
    ];
    return [head, ...lines].join('\n');
  });

  return [blast.summary, '', ...blocks, ...more(blast.downstream.length, shown.length)].join('\n');
}
