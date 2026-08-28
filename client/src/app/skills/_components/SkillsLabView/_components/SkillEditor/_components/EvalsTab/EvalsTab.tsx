/* Skill → Evals. What this skill is judged by, with the same actions the agent
   editor has (spec 13, R7 — skill side).

   A skill reviews nothing on its own: it is text that changes how an agent
   behaves. So the sets here belong to the agents that link it — and those are
   exactly the numbers that move when this text changes.

   Every per-case action works from here unchanged, because the server routes
   are case-scoped (`/eval-cases/:id/run|PUT|DELETE`) rather than agent-scoped.
   The one thing a skill genuinely cannot do is "run everything": which agent to
   run through is a choice, so each group gets its own run button instead. */
"use client";

import { useTranslations } from "next-intl";
import type { EvalCaseWithOwner } from "@devdigest/shared";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkillEvalCases } from "@/lib/hooks";
import { AgentGroup } from "./AgentGroup";
import { s } from "./styles";

export function EvalsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const cases = useSkillEvalCases(skillId);

  if (cases.isLoading) return <Skeleton />;
  if (cases.isError)
    return <ErrorState title={t("evals.loadFailed")} body={String(cases.error)} />;

  const rows = cases.data ?? [];
  if (rows.length === 0) {
    return (
      <div style={s.pad}>
        <EmptyState icon="FlaskConical" title={t("evals.none")} body={t("evals.noneBody")} />
      </div>
    );
  }

  const byOwner = new Map<string, { id: string; name: string; cases: EvalCaseWithOwner[] }>();
  for (const c of rows) {
    const bucket = byOwner.get(c.owner_id);
    if (bucket) bucket.cases.push(c);
    else
      byOwner.set(c.owner_id, {
        id: c.owner_id,
        name: c.owner_name ?? t("evals.thisSkill"),
        cases: [c],
      });
  }

  return (
    <div style={s.pad}>
      <div style={s.intro}>{t("evals.intro")}</div>
      {[...byOwner.values()].map((g) => (
        <AgentGroup key={g.id} agentId={g.id} name={g.name} cases={g.cases} />
      ))}
    </div>
  );
}
