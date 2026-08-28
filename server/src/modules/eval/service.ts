import type {
  EvalAgentSummary,
  EvalCase,
  EvalDashboardOverview,
  EvalRunRecord,
  EvalCaseFromFindingInput,
  EvalCasePreview,
  EvalExpectation,
  EvalOwnerKind,
  EvalRunResult,
  EvalRunGroup,
  EvalRun,
  EvalCaseWithOwner,
  EvalCaseInput,
} from '@devdigest/shared';
import { EvalExpectation as EvalExpectationSchema } from '@devdigest/shared';
import { z } from 'zod';

const EvalExpectationList = z.array(EvalExpectationSchema);
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { EvalRepository, type EvalCaseRow, type EvalRunRow } from './repository.js';
import { caseNameFor, expectationFor, scoreCase, toUnifiedDiff } from './helpers.js';

/**
 * Eval cases built from decided findings (spec 13, R1 + R2).
 *
 * The pipeline this feeds is: every accept and dismiss is already a labelled
 * example sitting in `findings`; this turns one into a row that can be replayed
 * against a future version of the agent.
 */
export class EvalService {
  private readonly repo: EvalRepository;

  constructor(private readonly container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  /**
   * Everything the case editor needs before the case exists: the derived name
   * and expectation, and the exact input the case would pin.
   *
   * The diff here is read the same way `createFromFinding` reads it, so what
   * the editor shows is what gets stored — a second, independent fetch could
   * disagree with the row and nobody would know which one ran.
   */
  async previewFromFinding(workspaceId: string, findingId: string): Promise<EvalCasePreview> {
    const { finding, review, pull, expectation } = await this.resolve(workspaceId, findingId);
    const [inputDiff, inputFiles, existing] = await Promise.all([
      this.repo.filePatch(review.prId, finding.file),
      this.repo.filePaths(review.prId),
      this.repo.findBySourceFinding(workspaceId, findingId),
    ]);
    const agentName = review.agentId ? await this.repo.agentName(review.agentId) : null;
    return {
      finding_id: finding.id,
      existing_case_id: existing?.id ?? null,
      name: caseNameFor(finding),
      expectation,
      input_diff: inputDiff ? toUnifiedDiff(finding.file, inputDiff) : '',
      input_files: inputFiles,
      pr: {
        number: pull.number,
        title: pull.title,
        body: pull.body,
        head_sha: review.headSha,
      },
      agent: review.agentId ? { id: review.agentId, name: agentName } : null,
    };
  }

  /**
   * Build a case from a finding the user has accepted or dismissed.
   *
   * Idempotent by source finding: clicking twice returns the case built the
   * first time rather than growing the set with duplicates that would each
   * count separately in recall.
   */
  async createFromFinding(
    workspaceId: string,
    findingId: string,
    input: EvalCaseFromFindingInput,
  ): Promise<{ case: EvalCase; created: boolean }> {
    const { finding, review, pull, expectation } = await this.resolve(workspaceId, findingId);
    if (!review.agentId) {
      // Cases are owned by the agent that produced the finding; a review with no
      // agent (an import, a hand-written summary) has no owner to run against.
      throw new ValidationError('The review this finding came from has no agent', {
        review_id: review.id,
      });
    }

    const existing = await this.repo.findBySourceFinding(workspaceId, findingId);
    if (existing) return { case: rowToDto(existing), created: false };

    // Pinned, not re-fetched: two runs of two agent versions must see
    // byte-identical input or the metric delta measures the diff, not the
    // change (spec 13, R2).
    const rawPatch = await this.repo.filePatch(review.prId, finding.file);
    // Headers matter: without them the parser resolves no path and grounding
    // drops every finding, so the case could never pass.
    const inputDiff = rawPatch ? toUnifiedDiff(finding.file, rawPatch) : null;
    if (!inputDiff) {
      throw new ValidationError(
        `No stored diff for ${finding.file} — the case would have no input to replay`,
        { file: finding.file, pr_id: review.prId },
      );
    }

    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: review.agentId,
      name: input.name?.trim() || caseNameFor(finding),
      inputDiff,
      inputMeta: {
        pr_number: pull.number,
        head_sha: review.headSha,
        source_finding_id: finding.id,
        source_run_id: review.runId,
      },
      expectedOutput: input.expected_output ?? [expectation],
      notes: input.notes ?? null,
    });
    return { case: rowToDto(row), created: true };
  }

  /**
   * The Eval Dashboard's overview (spec 13, R8).
   *
   * Every agent appears, including one with no cases and one that has never
   * been evaluated — the screen distinguishes "0" from "never run", so the
   * absence has to survive the query rather than collapse to a zero here.
   */
  async dashboard(workspaceId: string): Promise<EvalDashboardOverview> {
    const [agents, cases] = await Promise.all([
      this.repo.agents(workspaceId),
      this.repo.allCases(workspaceId),
    ]);
    const runs = await this.repo.runsForCases(cases.map((c) => c.id));
    const caseName = new Map(cases.map((c) => [c.id, c.name]));
    const ownerOfCase = new Map(cases.map((c) => [c.id, c.ownerId]));

    const summaries: EvalAgentSummary[] = agents.map((agent) => {
      const own = cases.filter((c) => c.ownerKind === 'agent' && c.ownerId === agent.id);
      // One run per case: the newest. Runs arrive newest-first, so the first
      // sighting of a case id is the one that counts.
      const latest = new Map<string, EvalRunRow>();
      for (const r of runs) {
        if (ownerOfCase.get(r.caseId) !== agent.id) continue;
        if (!latest.has(r.caseId)) latest.set(r.caseId, r);
      }
      const rows = [...latest.values()];
      if (rows.length === 0) {
        return {
          agent_id: agent.id,
          agent_name: agent.name,
          cases_total: own.length,
          last_run_at: null,
          recall: null,
          precision: null,
          citation_accuracy: null,
          passed: null,
          total: null,
        };
      }
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        cases_total: own.length,
        last_run_at: rows.reduce(
          (max, r) => (r.ranAt > max ? r.ranAt : max),
          rows[0]!.ranAt,
        ).toISOString(),
        recall: mean(rows.map((r) => r.recall)),
        precision: mean(rows.map((r) => r.precision)),
        citation_accuracy: mean(rows.map((r) => r.citationAccuracy)),
        passed: rows.filter((r) => r.pass === true).length,
        total: rows.length,
      };
    });

    return {
      agents: summaries,
      recent_runs: runs.slice(0, 20).map((r) => runRowToDto(r, caseName.get(r.caseId) ?? null)),
    };
  }

  /**
   * The finding, its review and PR, and the expectation its decision implies —
   * the read both the preview and the create path start from.
   */
  private async resolve(workspaceId: string, findingId: string) {
    const ctx = await this.container.reviewRepo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    // The decision IS the expectation. A finding nobody has judged carries no
    // label, so there is nothing to assert about it.
    const expectation = expectationFor(ctx.finding);
    if (!expectation) {
      throw new ValidationError(
        'Only an accepted or dismissed finding can become an eval case',
        { finding_id: findingId },
      );
    }
    return { ...ctx, expectation };
  }

  /**
   * What a SKILL can be judged by (spec 13, R7 — the skill side).
   *
   * A skill is a body of text: it reviews nothing on its own, so it has almost
   * no cases of its own. What it CAN be measured by is the sets of the agents
   * that link it — change the skill and those numbers move. Both are returned,
   * each tagged with its owner, so the tab can say "via Security Reviewer"
   * rather than showing a bare uuid.
   */
  async listForSkill(workspaceId: string, skillId: string): Promise<EvalCaseWithOwner[]> {
    const [own, agents] = await Promise.all([
      this.repo.listByOwner(workspaceId, 'skill', skillId),
      this.repo.agentsLinkingSkill(workspaceId, skillId),
    ]);
    const viaAgents = await Promise.all(
      agents.map(async (a) => {
        const rows = await this.repo.listByOwner(workspaceId, 'agent', a.id);
        return rows.map((r) => ({ ...rowToDto(r), owner_name: a.name }));
      }),
    );
    return [...own.map((r) => ({ ...rowToDto(r), owner_name: null })), ...viaAgents.flat()];
  }

  /**
   * Run ONE saved case and persist its row (spec 13, R3 — the per-case path).
   *
   * Distinct from `dryRun`, which scores a draft and stores nothing: this case
   * exists, so its result belongs in the history like any other. It gets its
   * own `ranAt`, which makes it a one-case "run" in the grouped view — correct,
   * because that is exactly what it was.
   */
  async runCase(workspaceId: string, caseId: string): Promise<EvalRunResult> {
    const row = await this.repo.caseById(workspaceId, caseId);
    if (!row) throw new NotFoundError('eval case not found');
    if (row.ownerKind !== 'agent') {
      throw new ValidationError('only agent-owned cases can be run');
    }
    const [result] = await this.runCases(workspaceId, row.ownerId, [row], new Date());
    return result!;
  }

  /**
   * Create a case by hand (spec 13 — the Case Editor).
   *
   * The one-click path only covers what an agent has already found or flagged.
   * A bug from someone else's incident, or an edge case a colleague raised in
   * review, has no finding to grow from — and those are exactly the cases worth
   * having before the agent misses them.
   *
   * Owner is the caller's choice, but a case owned by a SKILL cannot be run: a
   * skill reviews nothing. Storing it is still useful, so the route allows it
   * and `runCase` is what refuses.
   */
  async createCase(workspaceId: string, input: EvalCaseInput): Promise<EvalCase> {
    // The contract types `expected_output` as unknown, because the column is
    // jsonb. Parsing here is what stops an unrunnable case being stored: a case
    // whose expectation the scorer cannot read would silently score 0 forever.
    const expectations = EvalExpectationList.safeParse(input.expected_output);
    if (!expectations.success) {
      throw new ValidationError('expected_output must be a list of expectations');
    }
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff ?? '',
      // Hand-written cases have no PR behind them, so the meta that a
      // finding-born case pins is genuinely absent rather than empty.
      inputMeta: { manual: true },
      expectedOutput: expectations.data,
      notes: input.notes ?? null,
    });
    return rowToDto(row);
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: { name?: string; expected_output?: unknown; notes?: string | null },
  ): Promise<EvalCase> {
    const values: Record<string, unknown> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.expected_output !== undefined) values.expectedOutput = patch.expected_output;
    if (patch.notes !== undefined) values.notes = patch.notes;
    const row = await this.repo.updateCase(workspaceId, caseId, values);
    if (!row) throw new NotFoundError('eval case not found');
    return rowToDto(row);
  }

  /** Deleting a case takes its runs with it — the history of a case that no
      longer exists is not history anyone can act on. */
  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const gone = await this.repo.deleteCase(workspaceId, caseId);
    if (!gone) throw new NotFoundError('eval case not found');
  }

  async listForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCase[]> {
    const rows = await this.repo.listByOwner(workspaceId, ownerKind, ownerId);
    return rows.map(rowToDto);
  }

  /**
   * Run ONE case's input against an agent and score it, persisting nothing
   * (spec 13, R3 — the single-case path).
   *
   * The case editor needs this: the row does not exist until Save, so there is
   * no `case_id` to write a run against. Running an unsaved draft against a
   * real agent is the whole point of the button — you find out whether the
   * expectation you just wrote is one the agent can actually meet, before
   * committing it to the set.
   *
   * Same scorer, same grounding, same pinned-input rule as `runSet`; only the
   * INSERT is missing.
   */
  async dryRun(
    workspaceId: string,
    agentId: string,
    input: { name: string; input_diff: string; expected_output?: unknown },
  ): Promise<{ result: EvalRun; findings: unknown[]; error: string | null }> {
    const agent = await this.repo.agent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('agent not found');

    const [llm, skills] = await Promise.all([
      Promise.resolve(this.container.llm(agent.provider)),
      this.repo.skillBodies(agentId),
    ]);

    const startedAt = Date.now();
    const expectations = readExpectations(input.expected_output);
    let outcome: Awaited<ReturnType<typeof reviewPullRequest>> | null = null;
    let error: string | null = null;
    try {
      outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff: parseUnifiedDiff(input.input_diff ?? ''),
        llm,
        strategy: 'single-pass',
        task: `Review the change in "${input.name}".`,
        ...(skills.length > 0 ? { skills } : {}),
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const kept = (outcome?.review.findings ?? []).map((f) => ({
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
    }));
    const score = scoreCase(expectations, kept, kept.length + (outcome?.dropped.length ?? 0));
    return {
      result: {
        recall: score.recall,
        precision: score.precision,
        citation_accuracy: score.citation_accuracy,
        traces_passed: score.pass && !error ? 1 : 0,
        traces_total: 1,
        duration_ms: Date.now() - startedAt,
        cost_usd: outcome?.costUsd ?? null,
        per_trace: [
          {
            name: input.name,
            pass: score.pass && !error,
            expected: expectations,
            actual: error ? { error } : kept,
          },
        ],
      },
      findings: outcome?.review.findings ?? [],
      error,
    };
  }

  /**
   * Run history for an agent: the `eval_runs` rows grouped by the instant they
   * share (spec 13, R7 + R9). Newest first.
   *
   * The per-run metrics are the MEAN across that run's cases, computed here
   * rather than stored: a stored aggregate would silently disagree with its own
   * rows the moment a case is deleted.
   */
  async runHistory(workspaceId: string, agentId: string, limit = 20): Promise<EvalRunGroup[]> {
    const cases = await this.repo.listByOwner(workspaceId, 'agent', agentId);
    if (cases.length === 0) return [];
    const nameById = new Map(cases.map((c) => [c.id, c.name]));
    const rows = await this.repo.runsForCases([...nameById.keys()], limit * cases.length);

    const groups = new Map<string, EvalRunRow[]>();
    for (const r of rows) {
      const key = r.ranAt.toISOString();
      const bucket = groups.get(key);
      if (bucket) bucket.push(r);
      else groups.set(key, [r]);
    }

    const mean = (xs: (number | null)[]) => {
      const ns = xs.filter((n): n is number => n !== null);
      return ns.length === 0 ? 0 : ns.reduce((a, b) => a + b, 0) / ns.length;
    };

    return [...groups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, limit)
      .map(([ranAt, rs]) => {
        // Every row of a run carries the same agent snapshot; read it from the
        // first one that has it rather than re-reading the agent, which may
        // have been edited since.
        const snap = rs
          .map((r) => (r.actualOutput as { agent?: Record<string, unknown> } | null)?.agent)
          .find((a): a is Record<string, unknown> => !!a);
        const costs = rs.map((r) => r.costUsd).filter((c): c is number => c !== null);
        return {
          ran_at: ranAt,
          // A group with fewer rows than the set has cases is either still
          // running or predates a case that was added since. Either way its
          // metrics are means over a subset and must not be read as the run's.
          complete: rs.length >= cases.length,
          agent_version: typeof snap?.version === 'number' ? snap.version : null,
          model: typeof snap?.model === 'string' ? snap.model : null,
          system_prompt: typeof snap?.system_prompt === 'string' ? snap.system_prompt : null,
          cases_total: rs.length,
          passed: rs.filter((r) => r.pass).length,
          recall: mean(rs.map((r) => r.recall)),
          precision: mean(rs.map((r) => r.precision)),
          citation_accuracy: mean(rs.map((r) => r.citationAccuracy)),
          cost_usd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0),
          runs: rs.map((r) => ({
            id: r.id,
            case_id: r.caseId,
            case_name: nameById.get(r.caseId) ?? null,
            ran_at: r.ranAt.toISOString(),
            actual_output: r.actualOutput,
            pass: r.pass,
            recall: r.recall,
            precision: r.precision,
            citation_accuracy: r.citationAccuracy,
            duration_ms: r.durationMs,
            cost_usd: r.costUsd,
          })),
        };
      });
  }

  async runSet(workspaceId: string, agentId: string): Promise<EvalRunResult[]> {
    const agent = await this.repo.agent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('agent not found');

    const cases = await this.repo.listByOwner(workspaceId, 'agent', agentId);
    if (cases.length === 0) {
      throw new ValidationError('this agent has no eval cases to run');
    }
    // One instant for the whole run — see the doc comment.
    return this.runCases(workspaceId, agentId, cases, new Date());
  }

  /**
   * The shared execution path for both "run the set" and "run one case".
   *
   * Extracted rather than duplicated because everything in it is load-bearing
   * and would drift: the pinned input, the shared `ranAt`, the agent snapshot,
   * the per-case error containment, and the rule that an errored case is a
   * failure and not a 1/1/1 pass.
   */
  private async runCases(
    workspaceId: string,
    agentId: string,
    cases: EvalCaseRow[],
    ranAt: Date,
  ): Promise<EvalRunResult[]> {
    const agent = await this.repo.agent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('agent not found');

    const [llm, skills] = await Promise.all([
      Promise.resolve(this.container.llm(agent.provider)),
      this.repo.skillBodies(agentId),
    ]);

    const results: EvalRunResult[] = [];

    for (const row of cases) {
      const startedAt = Date.now();
      const expectations = readExpectations(row.expectedOutput);
      let outcome: Awaited<ReturnType<typeof reviewPullRequest>> | null = null;
      let error: string | null = null;

      try {
        outcome = await reviewPullRequest({
          systemPrompt: agent.systemPrompt,
          model: agent.model,
          diff: parseUnifiedDiff(row.inputDiff ?? ''),
          llm,
          strategy: 'single-pass',
          task: `Review the change in "${row.name}".`,
          ...(skills.length > 0 ? { skills } : {}),
        });
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      const kept = (outcome?.review.findings ?? []).map((f) => ({
        file: f.file,
        start_line: f.start_line,
        end_line: f.end_line,
      }));
      // Everything the model produced before the citation gate — kept plus what
      // grounding dropped. `citation_accuracy` is the ratio of the two.
      const rawCount = kept.length + (outcome?.dropped.length ?? 0);
      const score = scoreCase(expectations, kept, rawCount);

      const persisted = await this.repo.insertRun({
        caseId: row.id,
        ranAt,
        actualOutput: error
          ? { error }
          : {
              agent: {
                id: agent.id,
                name: agent.name,
                provider: agent.provider,
                model: agent.model,
                version: agent.version,
                system_prompt: agent.systemPrompt,
              },
              findings: outcome?.review.findings ?? [],
              dropped: outcome?.dropped.length ?? 0,
              missed: score.missed,
              flagged: score.flagged,
            },
        // A case whose run errored is a failure, not a zero-score pass: with no
        // findings at all the three metrics would otherwise read 1/1/1.
        pass: error ? false : score.pass,
        recall: score.recall,
        precision: score.precision,
        citationAccuracy: score.citation_accuracy,
        durationMs: Date.now() - startedAt,
        costUsd: outcome?.costUsd ?? null,
      });

      results.push({
        run_id: persisted.id,
        case_id: row.id,
        result: {
          recall: score.recall,
          precision: score.precision,
          citation_accuracy: score.citation_accuracy,
          traces_passed: score.pass && !error ? 1 : 0,
          traces_total: 1,
          duration_ms: persisted.durationMs ?? 0,
          cost_usd: persisted.costUsd ?? null,
          per_trace: [
            {
              name: row.name,
              pass: score.pass && !error,
              expected: expectations,
              actual: error ? { error } : kept,
            },
          ],
        },
      });
    }

    return results;
  }
}

/** Mean of the values that exist; null when none do. */
function mean(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function runRowToDto(row: EvalRunRow, caseName: string | null): EvalRunRecord {
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: caseName,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput ?? null,
    pass: row.pass,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
  };
}

function rowToDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles ?? null,
    input_meta: row.inputMeta ?? null,
    expected_output: (row.expectedOutput ?? []) as EvalExpectation[],
    notes: row.notes,
  };

  /**
   * Run every case in an agent's set and persist one `eval_runs` row per case
   * (spec 13, R3 + R6).
   *
   * Inputs are the case's pinned `input_diff` — nothing is fetched from GitHub
   * here. That is the whole point: two runs of two agent versions must see
   * byte-identical input, or the metric delta measures the diff rather than the
   * change to the agent.
   *
   * The rows of one run share a `ranAt` instant, which is what groups them into
   * "a run" for the history and the compare view. No `run_group_id` column
   * exists, and adding one would be a migration; the shared timestamp is
   * written once here rather than defaulted per row, so the grouping is exact
   * and not a range query over insert times.
   *
   * A case that throws does NOT roll back the ones already scored: a single
   * provider timeout would otherwise cost the whole set. The failure is
   * reported in that case's row instead.
   */
}
/** `expected_output` is `jsonb`, so it is unknown until parsed. A malformed
    array scores as no expectations rather than throwing mid-run. */
function readExpectations(raw: unknown): EvalExpectation[] {
  const parsed = EvalExpectationList.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
