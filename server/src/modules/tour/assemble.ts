/**
 * Prompt assembly (R14, R16) — pure. Returns the EXACT `{ system, user }`
 * pair the one call will receive, measured by an INJECTED `count` (never
 * `container.tokenizer` directly — same trick `modules/brief/assemble.ts`
 * uses) over `system + user + JSON.stringify(toJsonSchema(schema,
 * name).schema)` — the object the adapter literally sends as `input_schema`
 * / `json_schema`, never `JSON.stringify` of the bare Zod object. Still no
 * model call — that is what makes the 12 000-token ceiling assertable in a
 * hermetic test.
 *
 * `TOUR_BUDGET_CEILING` carries NO billing safety factor (`constants.ts`'s
 * doc comment, audit row 3) — this is a PRE-FLIGHT FLOOR, not the billed
 * number.
 */
import { toJsonSchema, wrapUntrusted } from '@devdigest/reviewer-core';
import { TourAnnotations } from './schemas.js';
import { TOUR_BUDGET_CEILING, TOUR_SCHEMA_NAME } from './constants.js';

export interface AssembleTreeFact {
  path: string;
  files: number;
  roleMix: Record<string, number>;
  topFile: string | null;
  folded: string[];
}
export interface AssembleEdgeFact {
  from: string;
  to: string;
}
export interface AssembleChainFact {
  chain_id: string;
  files: string[];
  endpoints: string[];
}
export interface AssembleDocumentFact {
  path: string;
  content: string;
}
export interface AssembleReadingFact {
  path: string;
  rank_percentile: number | null;
}
export interface AssembleSignatureFact {
  file: string;
  symbol: string;
  signature: string;
}
export interface AssembleConfigFacts {
  packageManager: string;
  scripts: string[];
  envExampleVars: string[];
  composeServices: string[];
  dockerfilePresent: boolean;
  /** The exact whitelist — repeated in the system instructions (P1, trusted,
   *  never dropped) AND here as untrusted context facts (P9). */
  whitelist: string[];
}
export interface AssembleCandidateFact {
  candidate_id: string;
  kind: string;
  scope: string;
  line: number | null;
  snippet: string;
}
export interface AssembleDifficultyFact {
  candidate_id: string;
  callers: number;
  rank_percentile: number | null;
}

export interface AssembleTourInput {
  /** The rendered `onboarding.system.md` (`renderPrompt`, with `{{language}}`
   *  supplied) — P1's instructions, five-section list and output-shape
   *  description. Trusted, outside every wrapper, never dropped. */
  system: string;
  /** P2 — repo name, language mix, file/dir counts, index status. Trusted
   *  (integers/enum), never dropped. */
  repoFacts: string;
  /** P3 — directory tree to depth 3. Untrusted (paths), droppable 5th. */
  tree: readonly AssembleTreeFact[];
  /** P4 — directory-level import edges. Trusted (derived), droppable 4th. */
  directoryEdges: readonly AssembleEdgeFact[];
  /** P5 — critical-path chains with endpoints/crons. Untrusted, NEVER
   *  dropped (R3/R10's reference set). */
  chains: readonly AssembleChainFact[];
  /** P6 — README + up to one further doc. Untrusted, droppable 1st. */
  documents: readonly AssembleDocumentFact[];
  /** P7 — rank-ordered file list with percentiles. Untrusted, NEVER dropped
   *  (R6's set and its order). */
  rankedReading: readonly AssembleReadingFact[];
  /** P8 — exported-symbol signatures in the top-ranked files. Untrusted,
   *  droppable 3rd. */
  symbolSignatures: readonly AssembleSignatureFact[];
  /** P9 — config facts (the whitelist's own evidence). Untrusted, NEVER
   *  dropped (R5's whitelist). */
  config: AssembleConfigFacts;
  /** P10 — first-task candidates with evidence. Untrusted, NEVER dropped
   *  (R8's reference set). */
  candidates: readonly AssembleCandidateFact[];
  /** P11 — difficulty inputs (`C`, `P`) per candidate. Trusted (integers),
   *  droppable 2nd — difficulty is computed in code either way (R9); these
   *  only help the model's phrasing. */
  difficultyInputs: readonly AssembleDifficultyFact[];
  /** Injected token counter — `container.tokenizer.count` at the call site,
   *  a stub in tests. Never imported from `src/adapters/` here. */
  count: (text: string) => number;
}

export type AssembleTourResult =
  | {
      readonly ok: true;
      readonly system: string;
      readonly user: string;
      readonly tokens: number;
      readonly droppedInputs: string[];
    }
  | {
      readonly ok: false;
      readonly reason: 'input_over_budget';
      readonly droppedInputs: string[];
      readonly tokens: number;
    };

/** Ascending drop order — lowest number first. P1, P2, P5, P7, P9, P10 are
 *  never in this list. */
const DROP_ORDER = ['documents', 'difficultyInputs', 'symbolSignatures', 'directoryEdges', 'tree'] as const;
type DropStep = (typeof DROP_ORDER)[number];

interface AssembleState {
  documents: boolean;
  difficultyInputs: boolean;
  symbolSignatures: boolean;
  directoryEdges: boolean;
  tree: boolean;
}

function initialState(): AssembleState {
  return { documents: true, difficultyInputs: true, symbolSignatures: true, directoryEdges: true, tree: true };
}

const STEP_APPLIERS: Record<DropStep, (s: AssembleState) => void> = {
  documents: (s) => (s.documents = false),
  difficultyInputs: (s) => (s.difficultyInputs = false),
  symbolSignatures: (s) => (s.symbolSignatures = false),
  directoryEdges: (s) => (s.directoryEdges = false),
  tree: (s) => (s.tree = false),
};

function renderTreeBlock(tree: readonly AssembleTreeFact[]): string {
  const lines = tree.map((t) => {
    const roleMix = Object.entries(t.roleMix)
      .map(([role, n]) => `${role}:${n}`)
      .join(' ');
    const folded = t.folded.length > 0 ? ` (+${t.folded.join(', ')})` : '';
    return `- ${t.path} — ${t.files} file(s) [${roleMix}]${t.topFile ? `, top: ${t.topFile}` : ''}${folded}`;
  });
  return lines.join('\n');
}

function renderEdgesBlock(edges: readonly AssembleEdgeFact[]): string {
  return edges.map((e) => `- ${e.from} -> ${e.to}`).join('\n');
}

function renderChainsBlock(chains: readonly AssembleChainFact[]): string {
  return chains
    .map(
      (c) =>
        `- ${c.chain_id}: ${c.files.join(' -> ')}` +
        (c.endpoints.length > 0 ? ` [endpoints: ${c.endpoints.join(', ')}]` : ''),
    )
    .join('\n');
}

function renderReadingBlock(reading: readonly AssembleReadingFact[]): string {
  return reading.map((r) => `- ${r.path}${r.rank_percentile != null ? ` (p${r.rank_percentile})` : ''}`).join('\n');
}

function renderSignaturesBlock(sigs: readonly AssembleSignatureFact[]): string {
  return sigs.map((s) => `- ${s.file}: ${s.symbol} — ${s.signature}`).join('\n');
}

function renderConfigBlock(config: AssembleConfigFacts): string {
  const lines = [
    `package manager: ${config.packageManager}`,
    `scripts: ${config.scripts.join(', ') || '(none)'}`,
    `.env variable names: ${config.envExampleVars.join(', ') || '(none)'}`,
    `compose services: ${config.composeServices.join(', ') || '(none)'}`,
    `Dockerfile present: ${config.dockerfilePresent}`,
    `allowed commands: ${config.whitelist.join(' | ') || '(none)'}`,
  ];
  return lines.join('\n');
}

function renderCandidatesBlock(candidates: readonly AssembleCandidateFact[]): string {
  return candidates
    .map((c) => `- ${c.candidate_id} [${c.kind}] ${c.scope}${c.line ? ':' + c.line : ''} — ${c.snippet}`)
    .join('\n');
}

function renderDifficultyBlock(inputs: readonly AssembleDifficultyFact[]): string {
  return inputs
    .map((d) => `- ${d.candidate_id}: callers=${d.callers}, rank_percentile=${d.rank_percentile ?? 'n/a'}`)
    .join('\n');
}

function render(input: AssembleTourInput, state: AssembleState): { system: string; user: string } {
  const sections: string[] = [];
  sections.push(`## Repo facts\n${input.repoFacts}`);

  if (state.tree && input.tree.length > 0) {
    sections.push(`## Directory tree\n${wrapUntrusted('directory-tree', renderTreeBlock(input.tree))}`);
  }
  if (state.directoryEdges && input.directoryEdges.length > 0) {
    sections.push(`## Directory edges\n${renderEdgesBlock(input.directoryEdges)}`);
  }
  if (input.chains.length > 0) {
    sections.push(`## Critical-path chains\n${wrapUntrusted('critical-path-chains', renderChainsBlock(input.chains))}`);
  }
  if (state.documents && input.documents.length > 0) {
    const docsBlock = input.documents
      .map((d, i) => wrapUntrusted(`document-${i}-${d.path}`, d.content))
      .join('\n\n');
    sections.push(`## Documents\n${docsBlock}`);
  }
  if (input.rankedReading.length > 0) {
    sections.push(`## Rank-ordered files\n${wrapUntrusted('ranked-reading', renderReadingBlock(input.rankedReading))}`);
  }
  if (state.symbolSignatures && input.symbolSignatures.length > 0) {
    sections.push(
      `## Exported symbol signatures\n${wrapUntrusted('symbol-signatures', renderSignaturesBlock(input.symbolSignatures))}`,
    );
  }
  sections.push(`## Config facts\n${wrapUntrusted('config-facts', renderConfigBlock(input.config))}`);
  if (input.candidates.length > 0) {
    sections.push(`## First-task candidates\n${wrapUntrusted('first-task-candidates', renderCandidatesBlock(input.candidates))}`);
  }
  if (state.difficultyInputs && input.difficultyInputs.length > 0) {
    sections.push(`## Difficulty inputs\n${renderDifficultyBlock(input.difficultyInputs)}`);
  }

  return { system: input.system, user: sections.join('\n\n') };
}

/**
 * The structured-output envelope, as text, for the token gate to count
 * (mirrors `modules/brief/assemble.ts`'s `briefSchemaEnvelope`). Both
 * adapters serialize `TourAnnotations` with this SAME `toJsonSchema` —
 * Anthropic as a forced tool's `input_schema`, OpenAI as
 * `response_format.json_schema` — so counting `JSON.stringify` of the bare
 * Zod object would measure the wrong string.
 */
export function tourSchemaEnvelope(): string {
  const { schema } = toJsonSchema(TourAnnotations, TOUR_SCHEMA_NAME);
  return [TOUR_SCHEMA_NAME, `Return the result as ${TOUR_SCHEMA_NAME}.`, JSON.stringify(schema)].join('\n');
}

export function assembleTourInput(input: AssembleTourInput): AssembleTourResult {
  const state = initialState();
  const droppedInputs: string[] = [];
  const envelope = tourSchemaEnvelope();

  const measure = (system: string, user: string): number => input.count(system + user + envelope);

  let { system, user } = render(input, state);
  let tokens = measure(system, user);

  if (tokens <= TOUR_BUDGET_CEILING) {
    return { ok: true, system, user, tokens, droppedInputs };
  }

  for (const step of DROP_ORDER) {
    STEP_APPLIERS[step](state);
    droppedInputs.push(step);
    ({ system, user } = render(input, state));
    tokens = measure(system, user);
    if (tokens <= TOUR_BUDGET_CEILING) {
      return { ok: true, system, user, tokens, droppedInputs };
    }
  }

  return { ok: false, reason: 'input_over_budget', droppedInputs, tokens };
}
