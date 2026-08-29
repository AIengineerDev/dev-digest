/**
 * `results/records.jsonl` — one line per (suite, case, arm, trial).
 *
 * Append-only and machine-first, because every statistic this package prints is
 * computed FROM it: `eval:delta` compares two labelled series, `eval:benchmark`
 * reads the spread across trials. A run that only printed a table would make
 * re-scoring mean paying for the sessions again.
 */
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Verdict } from './grade.js';

const here = dirname(fileURLToPath(import.meta.url));
export const RECORDS = join(here, '..', 'results', 'records.jsonl');

export interface Record_ {
  /** Free-form series name — `--label baseline`, `--label version-b`. */
  label: string;
  ranAt: string;
  kind: string;
  suite: string;
  case: string;
  arm: string;
  control: boolean;
  trial: number;
  model: string;
  ok: boolean;
  error?: string;
  costUsd: number;
  durationMs: number;
  turns: number;
  verdicts: Verdict[];
  tools: string[];
  reads: string[];
  agents: string[];
  skills: string[];
}

export function append(rec: Record_): void {
  mkdirSync(dirname(RECORDS), { recursive: true });
  appendFileSync(RECORDS, `${JSON.stringify(rec)}\n`);
}

export function readAll(): Record_[] {
  if (!existsSync(RECORDS)) return [];
  return readFileSync(RECORDS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record_);
}
