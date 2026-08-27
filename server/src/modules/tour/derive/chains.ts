/**
 * Critical-path derivation (R3, C5) — pure. `getCriticalPaths` returns
 * `string[][]` (paths only, no endpoints) — this file is where the chain
 * gets a stable id and its endpoint/cron annotation, joined against
 * `file_facts`.
 */
/** Structurally typed against the repo-intel facade's `FileFactsRow` — see
 *  `derive/diagram.ts`'s `FileEdgeLike` for why this isn't an import. */
export interface FileFactsLike {
  filePath: string;
  endpoints: string[];
  crons: string[];
}

export interface DerivedChain {
  chain_id: string;
  files: string[];
  endpoints: string[];
  /** Always `null` from this function — filled by `merge.ts` from the
   *  model's `critical_paths[].why`, matched by `chain_id`. */
  why: null;
}

export interface ChainsResult {
  chains: DerivedChain[];
  /** Set when `paths` was empty — C5's "no card, a named reason" case. */
  emptyReason: string | null;
}

function stableChainId(files: readonly string[], index: number): string {
  return `chain_${index}_${files[0]?.replace(/[^a-z0-9]+/gi, '_').slice(0, 40) ?? 'x'}`;
}

export function buildChains(paths: readonly string[][], facts: readonly FileFactsLike[]): ChainsResult {
  if (paths.length === 0) {
    return {
      chains: [],
      emptyReason: 'No dependency chains were found — the index has too few import edges to trace one.',
    };
  }

  const factsByFile = new Map(facts.map((f) => [f.filePath, f]));

  const chains: DerivedChain[] = paths.map((files, index) => {
    const endpoints: string[] = [];
    for (const file of files) {
      const fact = factsByFile.get(file);
      if (fact) endpoints.push(...fact.endpoints, ...fact.crons);
    }
    return {
      chain_id: stableChainId(files, index),
      files: [...files],
      endpoints: [...new Set(endpoints)],
      why: null,
    };
  });

  return { chains, emptyReason: null };
}
