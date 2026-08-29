/* Per-agent Eval Dashboard — metric cards, the regression banner, the trend and
   the run table. Design: design-mocks/src/14-screen_skills.jsx:131.

   Everything here is derived from the run rows the agent already has: no
   aggregate is stored, so nothing on this page can disagree with the runs it
   claims to summarise. */
"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LineChart,
  MetricCard,
  MonoLink,
  SectionLabel,
  Skeleton,
} from "@devdigest/ui";
import { useAgentEvalCases, useAgentEvalRuns, useRunEvals } from "@/lib/hooks";
import { CompareModal } from "@/components/EvalCompare";
import { MiniBar } from "./MiniBar";
import { regressionAlert, trendOf } from "./helpers";
import { s } from "./styles";

const ACCENT = "var(--accent)";
const OK = "var(--ok)";
const WARN = "var(--warn)";

export function AgentEvalView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const runs = useAgentEvalRuns(agentId);
  // Needed only to say how many cases a partial run is missing — the number
  // that makes "partial" actionable instead of mysterious.
  const cases = useAgentEvalCases(agentId);
  const run = useRunEvals();
  const [compareOpen, setCompareOpen] = React.useState(false);
  // Selection is by `ran_at` because that IS the run's identity here — the rows
  // of one run share it and there is no run id column.
  const [picked, setPicked] = React.useState<string[]>([]);
  const toggle = (k: string) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k].slice(-2)));

  if (runs.isLoading) return <Skeleton />;
  if (runs.isError) return <ErrorState title={t("dashboard.loadFailed")} body={String(runs.error)} />;

  const groups = runs.data ?? [];
  // A partial group's metrics are means over a subset — never the headline, and
  // never a trend point. But "no complete run" is not "never evaluated":
  // `complete` compares each past run against the CURRENT case count, so adding
  // one case marks every run in the history partial at once. Saying "never
  // evaluated" on a page whose own subtitle counts 19 runs is the one thing
  // this screen must not do.
  const complete = groups.filter((g) => g.complete);
  const latest = complete[0] ?? null;
  const previous = complete[1] ?? null;
  const newest = groups[0] ?? null;
  const alert = regressionAlert(latest, previous);
  const chosen = groups.filter((g) => picked.includes(g.ran_at));
  const pctOf = (v: number) => Math.round(v * 100);

  return (
    <div style={s.page}>
      <div style={s.head}>
        <div>
          <h1 style={s.h1}>{t("agent.title")}</h1>
          <p style={s.sub}>{t("agent.subtitle", { runs: groups.length })}</p>
        </div>
        <div style={s.headActions}>
          <MonoLink onClick={() => router.push(`/agents/${agentId}?tab=evals`)}>
            {t("agent.configure")}
          </MonoLink>
          <Button
            kind="primary"
            size="sm"
            icon="Play"
            disabled={run.isPending}
            onClick={() => run.mutate(agentId)}
          >
            {run.isPending ? t("agent.running") : t("agent.runEval")}
          </Button>
        </div>
      </div>

      {/* Only a DROP earns the banner — a banner that fires every run is one
          nobody reads. */}
      {alert && (
        <div style={s.alert}>
          <Icon.AlertTriangle size={16} style={{ color: WARN }} />
          <span style={s.alertText}>
            <b style={s.alertStrong}>
              {t("agent.alert.headline", { metric: alert.metric, pts: Math.abs(alert.pts) })}
            </b>{" "}
            {t("agent.alert.body")}
          </span>
        </div>
      )}

      {latest === null ? (
        <EmptyState
          icon="FlaskConical"
          title={newest === null ? t("agent.neverRun") : t("agent.partial")}
          body={
            newest === null
              ? t("agent.neverRunBody")
              : t("agent.partialBody", {
                  runs: groups.length,
                  total: cases.data?.length ?? newest.cases_total,
                  covered: newest.cases_total,
                })
          }
        />
      ) : (
        <>
          <div style={s.cards}>
            <MetricCard
              label={t("agent.metric.recall")}
              value={pctOf(latest.recall)}
              suffix="%"
              color={ACCENT}
              trend={trendOf(groups, (g) => g.recall)}
              {...(previous ? { delta: latest.recall - previous.recall } : {})}
            />
            <MetricCard
              label={t("agent.metric.precision")}
              value={pctOf(latest.precision)}
              suffix="%"
              color={OK}
              trend={trendOf(groups, (g) => g.precision)}
              {...(previous ? { delta: latest.precision - previous.precision } : {})}
            />
            <MetricCard
              label={t("agent.metric.citation")}
              value={pctOf(latest.citation_accuracy)}
              suffix="%"
              color={WARN}
              trend={trendOf(groups, (g) => g.citation_accuracy)}
              {...(previous ? { delta: latest.citation_accuracy - previous.citation_accuracy } : {})}
            />
          </div>

          {/* One run is a point, not a trend: the chart needs a second one
              before it says anything. */}
          {groups.length > 1 && (
            <Card style={{ marginBottom: 20 }}>
              <div style={s.chartHead}>
                <SectionLabel icon="TrendingUp">{t("agent.trend")}</SectionLabel>
                <div style={s.legend}>
                  {[
                    [t("agent.metric.recall"), ACCENT],
                    [t("agent.metric.precision"), OK],
                    [t("agent.metric.citation"), WARN],
                  ].map(([label, color]) => (
                    <span key={label} style={s.legendItem}>
                      <span style={s.swatch(color!)} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <LineChart
                series={[
                  { name: "recall", color: ACCENT, data: trendOf(groups, (g) => g.recall) },
                  { name: "precision", color: OK, data: trendOf(groups, (g) => g.precision) },
                  {
                    name: "citation",
                    color: WARN,
                    data: trendOf(groups, (g) => g.citation_accuracy),
                  },
                ]}
                w={900}
                h={200}
              />
            </Card>
          )}

          <SectionLabel icon="History">{t("agent.recentRuns")}</SectionLabel>
          {groups.length > 1 && (
            <div style={s.compareBar}>
              <Button
                kind="secondary"
                size="sm"
                icon="GitBranch"
                disabled={picked.length !== 2}
                onClick={() => setCompareOpen(true)}
              >
                {t("compare.action")}
              </Button>
              <span style={s.compareHint}>
                {picked.length === 2 ? "" : t("compare.select")}
              </span>
            </div>
          )}
          <div style={s.table}>
            <div style={s.th}>
              {["ranAt", "version", "recall", "precision", "citation", "pass", "cost"].map((k) => (
                <div key={k}>{t(`agent.table.${k}`)}</div>
              ))}
            </div>
            {groups.map((g, i) => (
              <div key={g.ran_at} style={s.tr(i === groups.length - 1)}>
                <span style={s.selectCell}>
                  <input
                    type="checkbox"
                    checked={picked.includes(g.ran_at)}
                    onChange={() => toggle(g.ran_at)}
                    aria-label={t("compare.action")}
                  />
                  <span className="mono" style={s.ranAt}>
                    {new Date(g.ran_at).toLocaleString()}
                  </span>
                </span>
                <span className="mono" style={s.version}>
                  {g.agent_version === null ? "—" : `v${g.agent_version}`}
                </span>
                <MiniBar value={g.recall} color={ACCENT} />
                <MiniBar value={g.precision} color={OK} />
                <MiniBar value={g.citation_accuracy} color={WARN} />
                <span className="tnum" style={s.pass}>
                  {g.passed}/{g.cases_total}
                  {g.complete ? "" : " *"}
                </span>
                <span className="mono tnum" style={s.cost}>
                  {g.cost_usd === null ? "—" : `$${g.cost_usd.toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {compareOpen && chosen.length === 2 && (
        <CompareModal
          // Always older → newer regardless of click order, or the arrows and
          // the sign of every delta would flip with the order of selection.
          older={chosen[1]!}
          newer={chosen[0]!}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}
