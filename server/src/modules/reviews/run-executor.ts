import type { Container } from '../../platform/container.js';
import type { IntentConfidenceBand, Provider, Review, RunTrace, SkillRef, UnifiedDiff } from '@devdigest/shared';
import { randomUUID } from 'node:crypto';
import { withAgentProviderContext } from '../_shared/provider-errors.js';
import { reviewPullRequest, countBlockers } from '@devdigest/reviewer-core';
import {
  describePromptSections,
  formatChars,
  formatSectionLine,
  summarisePromptAssembly,
} from './prompt-log.js';
import { RunLogger } from '../../platform/run-logger.js';
import * as schema from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { REVIEW_STRATEGY } from './constants.js';
import { taskLine } from './helpers.js';
import { loadDiff, type LoadedDiff } from './diff-loader.js';
import { IntentService } from './intent-service.js';
import { renderIntentBlock } from './intent-prompt.js';

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
/**
 * One queued run: an agent and the `agent_runs` row it writes into.
 *
 * `pinnedSkills` makes the run a REPLAY of an agent version: the skill set,
 * order and bodies come from that version's `agent_versions` snapshot instead of
 * the agent's current links. Absent (the live path) = current links, current
 * bodies.
 */
export type RunJob = { agent: AgentRow; runId: string; pinnedSkills?: SkillRef[] };

export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  private intentService: IntentService;

  constructor(
    private container: Container,
    private repo: ReviewRepository,
    private agents: Container['agentsRepo'],
  ) {
    this.intentService = new IntentService(container, repo);
  }

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    jobs: RunJob[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = new RunLogger(
      this.container.runBus,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
          })
          .catch(() => undefined);
        await this.repo
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        this.container.runBus.complete(runId);
      }
    };

    let loaded: LoadedDiff;
    try {
      loaded = await runLog.step('Loading PR diff', () => loadDiff(this.container, this.repo, workspaceId, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    const diff = loaded.diff;
    if (loaded.source === 'pr_files') {
      runLog.info(
        `Diff assembled from stored GitHub patches (pr_files) — the clone could not serve it: ${loaded.gitError ?? 'unknown reason'}`,
      );
    }
    runLog.info(
      `Diff ready at ${pull.headSha.slice(0, 7)} via ${loaded.source} — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`,
    );

    // Intent — derived ONCE per PR (not per agent), OUTSIDE the try above so
    // it can never call failAll: any throw here degrades to "no intent",
    // exactly like buildRepoMapDigest below. undefined → the key is not spread
    // into reviewPullRequest → the prompt is byte-identical to today's.
    const intent = await this.buildIntent(workspaceId, pull, runLog);

    for (const { agent, runId, pinnedSkills } of jobs) {
      const agentStart = Date.now();
      logger?.info(
        { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
        `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
      );
      try {
        const outcome = await this.runOneAgent(
          workspaceId,
          pull,
          repo,
          diff,
          agent,
          runId,
          runLog,
          pinnedSkills,
          intent,
        );
        logger?.info(
          {
            runId,
            agent: agent.name,
            findings: outcome.findings.length,
            grounding: outcome.grounding,
            durationMs: Date.now() - agentStart,
          },
          `review: agent "${agent.name}" done — ${outcome.findings.length} finding(s)`,
        );
      } catch (err) {
        // runOneAgent already persisted the failure/cancel (status + error +
        // trace) and completed the bus; here we only log at the run level.
        const cancelled = err instanceof RunCancelledError;
        logger?.[cancelled ? 'info' : 'error'](
          { runId, agent: agent.name, err: (err as Error).message, durationMs: Date.now() - agentStart },
          `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
        );
      }
    }
  }

  /** Execute a single agent's review against a PR, streaming progress. */
  private async runOneAgent(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    agent: AgentRow,
    runId: string,
    parentLog: RunLogger,
    pinnedSkills?: SkillRef[],
    intent?: { band: IntentConfidenceBand; text: string },
  ): Promise<RunOutcome> {
    const start = Date.now();
    // Assembled here (not inside the try) so a failure trace can still show the
    // skills block the run was about to use.
    let skillsBlock: string | null = null;
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace below
    // (built from the buffer) includes them too.
    const runLog = parentLog.forRun(runId, { agent: agent.name });

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    try {
      // Resolve the agent's LLM provider. (container.llm throws if the provider
      // key is missing — caught below and persisted as a failed run.)
      const llm = await runLog.step(
        `Resolving ${agent.provider} provider`,
        () =>
          withAgentProviderContext({ name: agent.name, provider: agent.provider, model: agent.model }, () =>
            this.container.llm(agent.provider as Provider),
          ),
        { kind: 'tool' },
      );

      // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
      // skip all enrichment entirely so its prompt is identical to the
      // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
      // flag, which still gates the facade internally.
      const repoIntelOn = agent.repoIntel !== false;
      if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

      // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
      // returns []; we omit the section and behavior is identical to the
      // pre-T1.3 prompt (acceptance #10).
      const callersDigest = repoIntelOn
        ? await this.buildCallersDigest(pull.repoId, diff, runLog)
        : undefined;

      // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
      // effort: when repo-intel is off / unindexed the facade degrades and the
      // prompt is identical to the pre-T3 shape.
      const repoMap = repoIntelOn ? await this.buildRepoMapDigest(pull.repoId, runLog) : undefined;
      const rankNote = repoIntelOn ? await this.buildRankNote(pull.repoId, diff, runLog) : '';

      const task = taskLine(pull) + rankNote;

      // Skills — the agent's ordered, globally-enabled linked skill bodies
      // (pinned snapshots when this run replays an agent version). Every
      // exclusion (disabled, budget-dropped, unresolved pin) is written to the
      // log, so what did NOT reach the prompt is visible in the Run Trace.
      const skills = await this.resolveSkills(workspaceId, agent.id, pinnedSkills);
      for (const note of skills.notes) runLog.info(note);
      skillsBlock = skills.blocks.length > 0 ? skills.blocks.join('\n\n') : null;

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        // Per-agent review strategy (configured in the Agent editor); falls back
        // to the studio default. single-pass = whole diff in one call.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        // Linked skills, in `agent_skills.order`. Omitted when the agent has
        // none enabled, so assemblePrompt leaves out `## Skills / rules`
        // entirely rather than emitting an empty section.
        ...(skills.blocks.length > 0 ? { skills: skills.blocks } : {}),
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        // Derived intent (specs/04-intent-layer.md) — omitted when derivation
        // was skipped/failed/degraded, so the prompt stays byte-identical.
        ...(intent ? { intent } : {}),
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.container.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
      const { tokensIn, tokensOut, costUsd, grounding } = outcome;

      // ---- Observability: what went into the prompt, without the prompt -----
      // Metadata only — section, source, size, model, correlation id. Never
      // content: `describePromptSections` returns numbers, and the stat type
      // has nowhere to put text (see prompt-log.ts). The correlation id is
      // stored on the trace below, so a size anomaly in the log leads back to
      // the assembly it describes.
      const correlationId = randomUUID().slice(0, 8);
      const verbose = this.container.config.promptLogVerbose;
      const sections = describePromptSections(
        outcome.assembly,
        verbose ? (text) => this.container.tokenizer.count(text) : undefined,
      );
      const summary = summarisePromptAssembly(sections, {
        correlationId,
        provider: agent.provider,
        model: agent.model,
      });
      runLog.info(
        `prompt assembled: ${summary.sections} sections, ${formatChars(summary.chars)} chars` +
          `${summary.tokens !== undefined ? ` / ${formatChars(summary.tokens)} tok` : ''}` +
          ` (${agent.provider}/${agent.model}, cid ${correlationId})`,
        summary,
      );
      if (verbose) {
        for (const stat of sections) {
          runLog.info(formatSectionLine(stat), { correlationId, ...stat });
        }
      }

      const keptFindings = outcome.review.findings;

      // ---- Persist review + findings ----------------------------------------
      const review = await this.repo.insertReview({
        workspaceId,
        prId: pull.id,
        agentId: agent.id,
        runId,
        headSha: pull.headSha,
        kind: 'review',
        verdict: outcome.review.verdict,
        summary: outcome.review.summary,
        score: outcome.review.score,
        model: agent.model,
      });
      const findingRows = await this.repo.insertFindings(review.id, keptFindings);
      runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

      // Mark the commit this review ran against so the PR list can tell
      // reviewed / needs-review (head moved) / stale apart.
      await this.repo.markReviewed(pull.id, pull.headSha);

      const durationMs = Date.now() - start;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(keptFindings, agent.ciFailOn);

      // ---- Observability: agent_runs + ONE run_traces document --------------
      await this.repo.completeAgentRun(runId, {
        status: 'done',
        durationMs,
        tokensIn,
        tokensOut,
        costUsd,
        findingsCount: findingRows.length,
        grounding,
        score: outcome.review.score,
        blockers,
        error: null,
      });

      const trace: RunTrace = {
        config: {
          agent: agent.name,
          version: String(agent.version),
          provider: agent.provider,
          model: agent.model,
          pr: pull.number,
          source: 'local',
        },
        stats: {
          duration_ms: durationMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: costUsd,
          findings: findingRows.length,
          grounding,
        },
        prompt_assembly: {
          ...outcome.assembly,
          // `used` is what the assembler already reports in the run log; the
          // trace kept only the concatenated bodies until now.
          skills_used: skills.used.length > 0 ? skills.used : null,
          correlation_id: correlationId,
        },
        tool_calls: outcome.chunks.map((c) => ({
          tool: 'review_file',
          args: c.label,
          meta: outcome.mode,
          ms: Math.round(durationMs / Math.max(outcome.chunks.length, 1)),
        })),
        raw_output: outcome.raw,
        memory_pulled: [],
        specs_read: [],
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      };
      runLog.info('Run complete; trace persisted');
      await this.repo.saveRunTrace(runId, trace);
      this.container.runBus.complete(runId);

      return { review, findings: findingRows, grounding, raw: outcome.review };
    } catch (err) {
      // Failure/cancel: persist status + the error text + the log-so-far so the
      // run (and WHY it failed) is visible on the UI after a reload.
      const cancelled = err instanceof RunCancelledError;
      const status = cancelled ? 'cancelled' : 'failed';
      const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
      runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
      await this.repo
        .completeAgentRun(runId, {
          status,
          durationMs: Date.now() - start,
          tokensIn: 0,
          tokensOut: 0,
          findingsCount: 0,
          grounding: '0/0 passed',
          error: msg,
        })
        .catch(() => undefined);
      await this.repo
        .saveRunTrace(
          runId,
          this.traceFromBuffer(runId, pull, agent, '0/0 passed', Date.now() - start, skillsBlock),
        )
        .catch(() => undefined);
      this.container.runBus.complete(runId);
      throw err;
    }
  }

  /**
   * Resolve the agent's linked skills into prompt blocks.
   *
   * Two owners, one call: the agents repository owns `agent_skills`, so the
   * ordered links come from there; the skills assembler (via the container)
   * owns the `enabled` kill-switch, pinned-version resolution and the assembly
   * budget. The executor only carries values between them.
   */
  private async resolveSkills(
    workspaceId: string,
    agentId: string,
    pinnedSkills?: SkillRef[],
  ) {
    const links = await this.agents.linkedSkills(agentId);
    return this.container.skills.assemble(
      workspaceId,
      links.map((l) => ({
        id: l.skill.id,
        name: l.skill.name,
        body: l.skill.body,
        enabled: l.skill.enabled,
        version: l.skill.version,
        source: l.skill.source,
      })),
      pinnedSkills,
    );
  }

  /**
   * Build a compact "Callers of changed symbols" digest for the prompt.
   *
   * Returns `undefined` when nothing should be added (flag off, no callers
   * found, or repo-intel errors) — `reviewPullRequest` omits the section in
   * that case (acceptance #10: flag off → identical prompt).
   *
   * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
   * rows per `getCallerSignatures` call) so the section stays under ~600
   * tokens even on heavy PRs.
   */
  private async buildCallersDigest(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return undefined;
    let rows;
    try {
      rows = await this.container.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    const byFile = new Map<string, string[]>();
    for (const r of rows) {
      const lines = byFile.get(r.file) ?? [];
      lines.push(`- \`${r.symbol}\` — ${r.signature}`);
      byFile.set(r.file, lines);
    }
    const out: string[] = [];
    for (const [file, lines] of byFile) {
      out.push(`### ${file}`);
      out.push(...lines);
    }
    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return out.join('\n');
  }

  /**
   * Derive the PR's intent ONCE per PR (specs/04-intent-layer.md). Best-effort
   * exactly like `buildRepoMapDigest`: any throw (including one `IntentService`
   * itself did not catch) degrades to `undefined`, never `failAll`. A degraded
   * row (model timed out / failed) is deliberately NOT rendered into the prompt
   * — only a real classification is.
   */
  private async buildIntent(
    workspaceId: string,
    pull: PullRow,
    runLog: RunLogger,
  ): Promise<{ band: IntentConfidenceBand; text: string } | undefined> {
    try {
      const record = await this.intentService.derive(workspaceId, pull.id, {}, runLog);
      if (!record || record.degraded) return undefined;
      const text = renderIntentBlock({
        category: record.category,
        summary: record.summary,
        in_scope: record.in_scope,
        out_of_scope: record.out_of_scope,
      });
      return { band: record.band, text };
    } catch (err) {
      runLog.info(`intent: derivation failed — ${(err as Error).message}; continuing without intent`);
      return undefined;
    }
  }

  /**
   * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
   * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
   * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
   */
  private async buildRepoMapDigest(
    repoId: string,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const map = await this.container.repoIntel.getRepoMap(repoId);
      if (map.degraded || map.text.trim().length === 0) return undefined;
      runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
      return map.text;
    } catch (err) {
      runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
   * note appended to the task framing, so the model prioritises hot core files.
   * Empty string when repo-intel is off / no changed file is hot.
   */
  private async buildRankNote(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return '';
    try {
      const ranks = await this.container.repoIntel.getFileRank(repoId, changedFiles);
      if (ranks.length === 0) return '';
      const hot = ranks.filter((r) => r.percentile >= 95);
      if (hot.length === 0) return '';
      runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
      return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
    } catch {
      return '';
    }
  }

  /**
   * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
   * failure/cancel (and pre-work failures) so the events (and WHY it failed)
   * survive a reload, not just the in-memory stream.
   */
  private traceFromBuffer(
    runId: string,
    pull: PullRow,
    agent: AgentRow,
    grounding: string,
    durationMs = 0,
    skills: string | null = null,
  ): RunTrace {
    return {
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
      },
      stats: { duration_ms: durationMs, tokens_in: 0, tokens_out: 0, cost_usd: null, findings: 0, grounding },
      // `skills` is the block this run had already assembled when it failed
      // (null when it failed before that, or the agent has none) — the same
      // slot a successful run reports, so a failed run does not silently look
      // like an agent with no rules.
      prompt_assembly: { system: agent.systemPrompt, skills, memory: null, specs: null, user: '' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: this.container.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    };
  }
}
