/**
 * The case vocabulary shared by every eval level.
 *
 * A case is a prompt plus expectations that are graded against what the session
 * ACTUALLY did — the tool calls it made and the files it read — not against
 * what it claimed in prose. "I dispatched the reviewer" is not evidence of a
 * dispatch; a `Task` tool call with `subagent_type: architecture-reviewer` is.
 */

/** Every expectation carries an id (stable across runs, so a series can be
 *  compared plant by plant) and a human sentence for the report. */
interface ExpectationBase {
  id: string;
  what: string;
  /**
   * A NEGATIVE expectation: it passes when the evidence is absent. The negative
   * control of an activation pair ("a plain question must not wake the skill")
   * is this, and it is the half that catches a skill whose description is too
   * greedy.
   */
  absent?: boolean;
}

export type Expectation = ExpectationBase &
  (
    | { kind: 'tool'; tool: string; input?: string }
    | { kind: 'reads'; path: string }
    | { kind: 'agent'; agent: string }
    | { kind: 'skill'; skill: string }
    /**
     * The weakest evidence there is, and the only kind available when the
     * artefact under test produces prose. `all` requires every pattern in the
     * same response, which is how a case demands the file AND the mechanism
     * rather than crediting a lucky mention of either.
     */
    | { kind: 'text'; pattern?: string; all?: string[] }
  );

export interface EvalCase {
  id: string;
  title: string;
  prompt: string;
  expect: Expectation[];
  /** Directory the session runs in. Relative to the suite file's directory. */
  cwd?: string;
  /**
   * Per-case override of the arm's session shape. A control/treatment pair that
   * differs in PROJECT CONTEXT rather than in a prompt body is expressed here:
   * one case runs with `settingSources: ['project']`, its control with `[]`.
   */
  override?: Pick<Arm, 'settingSources' | 'allowedTools' | 'disallowedTools' | 'append'>;
}

/**
 * One side of a comparison. `control` marks the arm that is SUPPOSED to miss —
 * it measures what the base model does without the artefact under test, so its
 * misses are the result and never a failure.
 */
export interface Arm {
  name: string;
  control?: boolean;
  /** Appended to the system prompt — this is where a skill or agent body goes. */
  append?: string | (() => string);
  /** Which project settings the session may load. `[]` = isolated. */
  settingSources?: ('user' | 'project' | 'local')[];
  allowedTools?: string[];
  disallowedTools?: string[];
  /** Named subagent to drive the session, when the harness supplies agents. */
  agent?: string;
}

export interface EvalSuite {
  name: string;
  /** Which command runs it: `eval:skills`, `eval:agents`, `eval:workflow`. */
  kind: 'skill' | 'agent' | 'workflow';
  /** The artefact under test — a skill or agent name, or the workflow's topic. */
  target: string;
  model?: string;
  /** Hard ceiling per session. A runaway case must cost a bounded amount. */
  maxTurns?: number;
  arms: Arm[];
  cases: EvalCase[];
}
