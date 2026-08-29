/**
 * One graded agent session, run through the **Claude Agent SDK** — which means
 * it authenticates with the Claude login this machine already has (the same
 * credential `claude` uses), not with an `ANTHROPIC_API_KEY`. Nothing here
 * reads a key; `evals/run.ts`, the older A/B harness, still does, and the two
 * are deliberately separate transports.
 *
 * What comes back is a TRAJECTORY, not a string: every tool call with its
 * input, every file read, every subagent dispatched, every skill activated. The
 * graders score that. Prose is scored too, but only where the case asks for it
 * — a session that SAYS it reviewed the architecture and never called the
 * reviewer has to fail, and it can only fail if the evidence is the tool call.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface Trajectory {
  /** Ordered tool calls, exactly as the model issued them. */
  tools: ToolCall[];
  /** `file_path`/`path`/`pattern` arguments of every read-shaped call. */
  reads: string[];
  /** `subagent_type` of every `Task` dispatch. */
  agents: string[];
  /** Every skill the session activated (the `Skill` tool's argument). */
  skills: string[];
  /** Concatenated assistant prose. */
  text: string;
  ok: boolean;
  error?: string;
  costUsd: number;
  durationMs: number;
  turns: number;
}

export interface SessionOptions {
  prompt: string;
  cwd: string;
  model?: string;
  maxTurns?: number;
  append?: string;
  settingSources?: ('user' | 'project' | 'local')[];
  allowedTools?: string[];
  disallowedTools?: string[];
  /** Wall-clock ceiling. A hung session must not hold a CI job open. */
  timeoutMs?: number;
}

const READ_ARGS = ['file_path', 'path', 'notebook_path'];

function record(block: { name: string; input: unknown }, into: Trajectory): void {
  const input = (block.input ?? {}) as Record<string, unknown>;
  into.tools.push({ name: block.name, input });
  for (const key of READ_ARGS) {
    const value = input[key];
    if (typeof value === 'string') into.reads.push(value);
  }
  // Grep and Glob do not read a file, but they DO prove the session went
  // looking in a place, which is what a routing case is asking about.
  if ((block.name === 'Grep' || block.name === 'Glob') && typeof input.path === 'string') {
    into.reads.push(input.path);
  }
  // The subagent tool is `Agent` in this harness and `Task` in others, and the
  // key naming the agent has moved too. Measured: a `dispatch` case scored 0
  // while the trajectory plainly showed an `Agent` call — a false negative in
  // the grader, which is the worst kind, because it reads as a routing bug in
  // the thing under test. Record the whole input and let the grader match.
  if (block.name === 'Task' || block.name === 'Agent') into.agents.push(JSON.stringify(input));
  // The Skill tool's argument key is not pinned by the SDK's public types, so
  // record the whole input and let the grader match a name inside it. A missed
  // activation must not look like a design decision.
  if (block.name === 'Skill') into.skills.push(JSON.stringify(input));
  // A skill invoked as a slash command arrives as `SlashCommand` in some
  // harness versions; treat it as the same evidence.
  if (block.name === 'SlashCommand' && typeof input.command === 'string') {
    into.skills.push(input.command.replace(/^\//, '').split(/\s/)[0] ?? '');
  }
}

export async function runSession(opts: SessionOptions): Promise<Trajectory> {
  const started = Date.now();
  const traj: Trajectory = {
    tools: [], reads: [], agents: [], skills: [], text: '',
    ok: false, costUsd: 0, durationMs: 0, turns: 0,
  };

  const controller = new AbortController();
  // 300 s was too tight: a control arm explores more than a treatment arm — 26
  // turns against 10 on the same case — and one aborted mid-review, which is
  // recorded as a failed session and reads like a model failure.
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 600_000);
  try {
    const stream = query({
      prompt: opts.prompt,
      options: {
        cwd: opts.cwd,
        model: opts.model ?? 'claude-sonnet-5',
        maxTurns: opts.maxTurns ?? 12,
        abortController: controller,
        // `[]` is an ISOLATED session: no CLAUDE.md, no project skills, no
        // project agents. That is the control side of every context case, and
        // it is also what makes a skill-content eval measure the skill body
        // instead of the repository around it.
        settingSources: opts.settingSources ?? [],
        // ALWAYS the preset, on both sides. Omitting `systemPrompt` is not
        // "the default" — it is a different prompt, so a control arm without
        // it would differ from its treatment in two things at once and the
        // delta would no longer be about the skill.
        systemPrompt: {
          type: 'preset' as const,
          preset: 'claude_code' as const,
          ...(opts.append ? { append: opts.append } : {}),
        },
        ...(opts.allowedTools ? { allowedTools: opts.allowedTools } : {}),
        ...(opts.disallowedTools ? { disallowedTools: opts.disallowedTools } : {}),
      },
    });

    for await (const message of stream as AsyncIterable<Record<string, unknown>>) {
      if (message.type === 'assistant') {
        traj.turns += 1;
        const inner = message.message as { content?: unknown[] } | undefined;
        for (const block of inner?.content ?? []) {
          const b = block as { type?: string; text?: string; name?: string; input?: unknown };
          if (b.type === 'text' && typeof b.text === 'string') traj.text += `${b.text}\n`;
          if (b.type === 'tool_use' && typeof b.name === 'string') {
            record({ name: b.name, input: b.input }, traj);
          }
        }
      }
      if (message.type === 'result') {
        traj.ok = message.subtype === 'success';
        traj.costUsd = typeof message.total_cost_usd === 'number' ? message.total_cost_usd : 0;
        if (!traj.ok) traj.error = String(message.subtype);
        if (typeof message.result === 'string' && !traj.text) traj.text = message.result;
      }
    }
  } catch (err) {
    traj.ok = false;
    traj.error = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
  }
  traj.durationMs = Date.now() - started;
  return traj;
}
