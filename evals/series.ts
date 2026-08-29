/**
 * Statistics over `results/records.jsonl`.
 *
 *   pnpm eval:delta --a baseline --b version-b     # two labelled series, per plant
 *   pnpm eval:benchmark --label baseline           # control vs treatment, with spread
 *
 * Both read records that already exist. Nothing here calls a model, so a
 * scorer that turns out to be wrong is re-run for free — which is the whole
 * reason the runner writes JSONL instead of only a table.
 *
 * Read a delta PER EXPECTATION, never as one score. "The score dropped" is not
 * a finding; "`di-container` went 5/5 → 0/5 and nothing else moved" is.
 */
import { readAll, type Record_ } from './src/records.js';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const mode = argv[0] === 'benchmark' ? 'benchmark' : 'delta';

/** key → [passed, total] over every trial of one expectation in one arm. */
type Rates = Map<string, [number, number]>;

function ratesOf(records: Record_[]): Rates {
  const out: Rates = new Map();
  for (const r of records) {
    for (const v of r.verdicts) {
      const key = `${r.suite}/${r.case}/${r.arm}/${v.id}`;
      const [p, t] = out.get(key) ?? [0, 0];
      out.set(key, [p + (v.pass ? 1 : 0), t + 1]);
    }
  }
  return out;
}

const pct = (r: [number, number] | undefined): string =>
  r ? `${r[0]}/${r[1]}` : '—';

function delta(): void {
  const a = flag('a') ?? 'baseline';
  const b = flag('b');
  if (!b) throw new Error('usage: eval:delta --a <label> --b <label>');
  const all = readAll();
  const ra = ratesOf(all.filter((r) => r.label === a));
  const rb = ratesOf(all.filter((r) => r.label === b));
  if (!ra.size) throw new Error(`no records labelled \`${a}\``);
  if (!rb.size) throw new Error(`no records labelled \`${b}\``);

  const keys = [...new Set([...ra.keys(), ...rb.keys()])].sort();
  const rows = keys.map((k) => {
    const x = ra.get(k);
    const y = rb.get(k);
    const rate = (r: [number, number] | undefined): number => (r && r[1] ? r[0] / r[1] : NaN);
    const moved = !Number.isNaN(rate(x)) && !Number.isNaN(rate(y)) && rate(x) !== rate(y);
    const dir = Number.isNaN(rate(x)) || Number.isNaN(rate(y))
      ? 'only in one series'
      : rate(y) > rate(x) ? '↑ gained' : rate(y) < rate(x) ? '↓ LOST' : '=';
    return { k, x, y, moved, dir };
  });

  process.stdout.write(
    [
      '',
      `### delta \`${a}\` → \`${b}\``,
      '',
      '| suite / case / arm / expectation | ' + a + ' | ' + b + ' | |',
      '| --- | --- | --- | --- |',
      ...rows.map((r) => `| \`${r.k}\` | ${pct(r.x)} | ${pct(r.y)} | ${r.dir} |`),
      '',
      `${rows.filter((r) => r.dir === '↓ LOST').length} expectation(s) lost, ` +
        `${rows.filter((r) => r.dir === '↑ gained').length} gained, ` +
        `${rows.filter((r) => r.dir === '=').length} unchanged.`,
      '',
    ].join('\n'),
  );
}

function benchmark(): void {
  const label = flag('label');
  const all = readAll().filter((r) => !label || r.label === label);
  if (!all.length) throw new Error(label ? `no records labelled \`${label}\`` : 'no records yet');

  // Per case, per arm: how many expectations passed in each trial. The SPREAD
  // across trials is the number that matters — a single green run of a
  // non-deterministic agent is an anecdote, and this is where that shows.
  const byArm = new Map<string, number[]>();
  const cost = new Map<string, number>();
  for (const r of all) {
    const key = `${r.suite}/${r.case}/${r.arm}${r.control ? ' *' : ''}`;
    const passed = r.verdicts.filter((v) => v.pass).length;
    byArm.set(key, [...(byArm.get(key) ?? []), passed]);
    cost.set(key, (cost.get(key) ?? 0) + r.costUsd);
  }

  const rows = [...byArm.entries()].sort().map(([key, xs]) => {
    const mean = xs.reduce((n, x) => n + x, 0) / xs.length;
    const spread = xs.length > 1 ? `${Math.min(...xs)}–${Math.max(...xs)}` : `${xs[0]}`;
    return `| \`${key}\` | ${xs.length} | ${mean.toFixed(1)} | ${spread} | $${(cost.get(key) ?? 0).toFixed(2)} |`;
  });

  process.stdout.write(
    [
      '',
      `### benchmark${label ? ` — label \`${label}\`` : ''}`,
      '',
      '| suite / case / arm | trials | passed (mean) | spread | $ |',
      '| --- | --- | --- | --- | --- |',
      ...rows,
      '',
      '`*` = control arm. Compare a treatment against its own control, never against another suite.',
      '',
    ].join('\n'),
  );
}

try {
  if (mode === 'benchmark') benchmark();
  else delta();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
