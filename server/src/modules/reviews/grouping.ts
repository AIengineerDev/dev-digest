/**
 * R3/N3 — pure grouping of a multi-agent run's findings into `FindingGroup[]`.
 * Domain logic, module-local: imports only `@devdigest/shared` types, so it
 * introduces no `db`/`repository`/`container` edge (`pnpm arch`). Takes
 * findings that are already loaded — it never re-reads the diff.
 */
import type { FindingGroup, FindingGroupTake, FindingRecord } from '@devdigest/shared';

const SEVERITY_RANK: Record<FindingRecord['severity'], number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

interface AgentFindings {
  agent_id: string;
  agent_name: string | null;
  findings: FindingRecord[];
}

interface Member {
  agent_id: string;
  agent_name: string | null;
  finding: FindingRecord;
}

/** Two findings join when `file` matches and their line ranges overlap. */
function overlaps(a: FindingRecord, b: FindingRecord): boolean {
  return a.file === b.file && a.start_line <= b.end_line && b.start_line <= a.end_line;
}

/** Highest-severity member's title; ties broken by earliest `start_line`. */
function groupTitle(members: Member[]): string {
  let best = members[0]!;
  for (const m of members.slice(1)) {
    const bestRank = SEVERITY_RANK[best.finding.severity];
    const rank = SEVERITY_RANK[m.finding.severity];
    if (
      rank > bestRank ||
      (rank === bestRank && m.finding.start_line < best.finding.start_line)
    ) {
      best = m;
    }
  }
  return best.finding.title;
}

export function groupFindings(input: AgentFindings[]): FindingGroup[] {
  // Flatten to (agent, finding) pairs, then union findings whose file+range
  // overlap into clusters. A finding only ever joins one cluster.
  const flat: Member[] = [];
  for (const { agent_id, agent_name, findings } of input) {
    for (const finding of findings) flat.push({ agent_id, agent_name, finding });
  }

  const clusters: Member[][] = [];
  for (const member of flat) {
    const cluster = clusters.find((c) => c.some((m) => overlaps(m.finding, member.finding)));
    if (cluster) cluster.push(member);
    else clusters.push([member]);
  }

  return clusters.map((members) => {
    const file = members[0]!.finding.file;
    const anchorStart = Math.min(...members.map((m) => m.finding.start_line));
    const anchorEnd = Math.max(...members.map((m) => m.finding.end_line));

    const takes: FindingGroupTake[] = input.map(({ agent_id, agent_name }) => {
      const member = members.find((m) => m.agent_id === agent_id);
      return { agent_id, agent_name, finding: member ? member.finding : null };
    });

    const flagged = takes.some((t) => t.finding !== null);
    const silent = takes.some((t) => t.finding === null);

    return {
      key: `${file}:${anchorStart}-${anchorEnd}`,
      file,
      anchor_start: anchorStart,
      anchor_end: anchorEnd,
      title: groupTitle(members),
      takes,
      conflict: flagged && silent,
    };
  });
}
