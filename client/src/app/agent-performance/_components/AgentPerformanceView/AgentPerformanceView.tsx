/* /agent-performance — the global Agent Performance dashboard.

   Aggregates the SAME stored runs and findings a single agent's Stats reads,
   through the same server aggregation, so a row here and that agent's own page
   cannot disagree. Nothing on this screen starts work: reloading, sorting and
   changing the period are selects.

   Two rules the numbers follow, and the reason they are visible in the UI:

   - An accept rate over zero decisions is UNKNOWN, not 0%. Rendering the second
     for the first reports a quality problem that does not exist, so the cell
     shows a dash with the reason on hover.
   - Every cost here is DevDigest's own estimate from token counts and a price
     table. None of it is reconciled against a provider invoice, and the badge
     says so — a number that looks like billing and is not is worse than none. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import type { AgentPerformanceRow, CostSlice } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import {
  customPeriod,
  periodFor,
  sortRows,
  useAgentPerformance,
  type Period,
  type SortKey,
} from "../../../../lib/hooks/agent-performance";
import { s } from "./styles";

const SLICE_COLORS = ["#D2685C", "#D6A241", "#6FA8DC", "#58AE93", "#C98BC0", "#8C9AA8"];

const usd = (v: number | null) => (v === null ? null : `$${v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(2)}`);
const secs = (ms: number | null) => (ms === null ? null : `${(ms / 1000).toFixed(1)}s`);
const pct = (v: number | null) => (v === null ? null : `${Math.round(v * 100)}%`);

function ago(iso: string | null, never: string) {
  if (!iso) return never;
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const toInput = (d: Date) => d.toISOString().slice(0, 10);

export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const router = useRouter();

  const [period, setPeriod] = React.useState<Period>(() => periodFor("30d"));
  const [draft, setDraft] = React.useState({ from: toInput(period.from), to: toInput(period.to) });
  const [sort, setSort] = React.useState<SortKey>("acceptRate");

  const { data, isPending, isError, refetch, isFetching } = useAgentPerformance(period);

  const rows = React.useMemo(() => (data ? sortRows(data.rows, sort) : []), [data, sort]);

  const header = (
    <div style={s.headerRow}>
      <div>
        <h1 style={s.h1}>{t("title")}</h1>
        <p style={s.subtitle}>{t("subtitle")}</p>
      </div>
      <div>
        <div style={s.periodBar}>
          <button style={s.periodBtn(period.key === "1d")} onClick={() => setPeriod(periodFor("1d"))}>
            {t("period.day")}
          </button>
          <button style={s.periodBtn(period.key === "30d")} onClick={() => setPeriod(periodFor("30d"))}>
            {t("period.month")}
          </button>
          <input
            type="date"
            aria-label={t("period.from")}
            style={s.dateInput}
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
          <input
            type="date"
            aria-label={t("period.to")}
            style={s.dateInput}
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
          <button
            style={s.periodBtn(period.key === "custom")}
            onClick={() => {
              const from = new Date(draft.from);
              const to = new Date(draft.to);
              if (!Number.isNaN(+from) && !Number.isNaN(+to) && from < to) setPeriod(customPeriod(from, to));
            }}
          >
            {t("period.apply")}
          </button>
        </div>
        <p style={s.periodNote}>{t("period.note")}</p>
      </div>
    </div>
  );

  /* Loading shows skeletons, never zeros. A zero is a measurement; an unloaded
     screen has not measured anything yet, and the two must not look alike. */
  if (isPending) {
    return (
      <AppShell>
        <div style={s.page}>
          {header}
          <div style={s.cards}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={s.statCard}>
                <Skeleton width={110} height={11} />
                <div style={{ marginTop: 14 }}>
                  <Skeleton width={90} height={28} />
                </div>
              </div>
            ))}
          </div>
          <div style={s.card}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <Skeleton height={16} />
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell>
        <div style={s.page}>
          {header}
          <ErrorState title={t("loadError")} body={t("loadErrorBody")} onRetry={() => refetch()} />
        </div>
      </AppShell>
    );
  }

  // An empty workspace and a period with no runs are different situations with
  // different remedies, so they get different screens.
  if (data.total_runs === 0) {
    const everRan = data.excluded.failed > 0 || data.excluded.no_cost > 0;
    return (
      <AppShell>
        <div style={s.page}>
          {header}
          <EmptyState
            icon="Activity"
            title={everRan ? t("emptyPeriod.title") : t("empty.title")}
            body={everRan ? t("emptyPeriod.body") : t("empty.body")}
          />
        </div>
      </AppShell>
    );
  }

  const basisHint = t(`costBasis.${data.cost_basis}Hint`);

  return (
    <AppShell>
      <div style={s.page}>
        {header}

        <div style={s.cards}>
          <div style={s.statCard}>
            <p style={s.statLabel}>{t("summary.totalRuns")}</p>
            <p style={s.statValue}>{data.total_runs}</p>
            <p style={s.statSub}>{t("summary.runsIn", { n: data.counted_runs })}</p>
          </div>

          <div style={s.statCard}>
            <p style={s.statLabel}>{t("summary.totalCost")}</p>
            <p style={s.statValue}>{usd(data.total_cost_usd)}</p>
            <p style={s.statSub} title={basisHint}>
              <Badge>{t(`costBasis.${data.cost_basis}`)}</Badge>
            </p>
          </div>

          <div style={s.statCard}>
            <p style={s.statLabel}>{t("summary.avgAcceptRate")}</p>
            {data.avg_accept_rate === null ? (
              <>
                <p style={s.statUnknown}>—</p>
                <p style={s.statSub}>{t("summary.noDecisions")}</p>
              </>
            ) : (
              <>
                <p style={s.statValue}>
                  {Math.round(data.avg_accept_rate * 100)}
                  <span style={s.statUnit}>%</span>
                </p>
                <p style={s.statSub}>{t("summary.decisions", { n: data.total_decided })}</p>
              </>
            )}
          </div>

          <div style={s.statCard}>
            <p style={s.statLabel}>{t("summary.mostActive")}</p>
            {data.most_active ? (
              <>
                <p style={{ ...s.statValue, fontSize: 18, marginTop: 12 }}>{data.most_active.agent_name}</p>
                <p style={s.statSub}>
                  {data.most_active.runs} runs
                  {data.most_active.accept_rate !== null ? ` · ${pct(data.most_active.accept_rate)} accept` : ""}
                </p>
              </>
            ) : (
              <>
                <p style={s.statUnknown}>—</p>
                <p style={s.statSub}>{t("summary.noRuns")}</p>
              </>
            )}
          </div>
        </div>

        <div style={s.card}>
          <div style={s.headRow}>
            <span>{t("table.agent")}</span>
            <SortHead label={t("table.runs")} k="runs" sort={sort} onSort={setSort} />
            <SortHead label={t("table.avgCost")} k="avgCost" sort={sort} onSort={setSort} />
            <SortHead label={t("table.avgDuration")} k="avgDuration" sort={sort} onSort={setSort} />
            <SortHead label={t("table.accept")} k="acceptRate" sort={sort} onSort={setSort} />
            <SortHead label={t("table.lastRun")} k="lastRun" sort={sort} onSort={setSort} />
            <span />
          </div>

          {rows.map((r) => (
            <Row key={r.agent_id} row={r} min={data.min_decisions_for_rate} t={t} router={router} />
          ))}
        </div>

        <div style={s.sectionTitle}>
          <Icon.DollarSign size={13} />
          {t("costBreakdown")}
        </div>
        <div style={s.breakdown}>
          <Breakdown title={t("costByAgent")} slices={data.cost_by_agent} empty={t("noCost")} />
          <Breakdown title={t("costByModel")} slices={data.cost_by_model} empty={t("noCost")} />
        </div>

        <p style={s.footnote}>
          {t("excluded", { failed: data.excluded.failed, noCost: data.excluded.no_cost })}
          {" "}
          {basisHint}
          {isFetching ? " · refreshing" : ""}
        </p>
      </div>
    </AppShell>
  );
}

function SortHead({
  label,
  k,
  sort,
  onSort,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
}) {
  const on = sort === k;
  return (
    <button style={s.sortBtn(on)} onClick={() => onSort(k)} aria-pressed={on}>
      {label}
      {on ? " ↓" : ""}
    </button>
  );
}

function Row({
  row,
  min,
  t,
  router,
}: {
  row: AgentPerformanceRow;
  min: number;
  t: ReturnType<typeof useTranslations>;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div style={s.row}>
      <div style={s.agentCell}>
        <span style={s.agentName}>{row.agent_name}</span>
        {row.deleted && (
          <span title={t("row.deletedHint")}>
            <Badge>{t("row.deleted")}</Badge>
          </span>
        )}
      </div>

      <span style={s.num}>{row.runs}</span>
      <span style={s.num}>{usd(row.avg_cost_usd) ?? <span style={s.muted}>—</span>}</span>
      <span style={s.num}>{secs(row.avg_duration_ms) ?? <span style={s.muted}>—</span>}</span>

      <div style={s.acceptCell}>
        {row.accept_rate === null ? (
          <span style={s.muted} title={t("row.noDecisionsHint")}>
            {t("row.noDecisions")}
          </span>
        ) : (
          <>
            <span style={s.acceptPct(row.accept_rate >= 0.6)}>{pct(row.accept_rate)}</span>
            <span style={s.denom}>{t("row.acceptOf", { accepted: row.accepted, decided: row.decided })}</span>
            {!row.accept_rate_reliable && (
              <span title={t("row.smallSampleHint", { n: min })}>
                <Badge color="var(--warning)" bg="color-mix(in srgb, var(--warning) 14%, transparent)">{t("row.smallSample")}</Badge>
              </span>
            )}
          </>
        )}
      </div>

      <span style={{ ...s.num, ...s.muted }}>{ago(row.last_run_at, t("row.never"))}</span>

      <button
        style={s.viewBtn}
        onClick={() => router.push(`/agents/${row.agent_id}`)}
        disabled={row.deleted}
        title={row.deleted ? t("row.deletedHint") : undefined}
      >
        {t("table.view")}
      </button>
    </div>
  );
}

function Breakdown({ title, slices, empty }: { title: string; slices: CostSlice[]; empty: string }) {
  const total = slices.reduce((sum, x) => sum + x.cost_usd, 0);
  return (
    <div style={{ ...s.card, padding: "14px 16px" }}>
      <p style={{ ...s.statLabel, marginBottom: 6 }}>{title}</p>
      {slices.length === 0 ? (
        <p style={{ ...s.statSub, margin: "10px 0 0" }}>{empty}</p>
      ) : (
        slices.map((x, i) => (
          <div key={x.label} style={s.slice}>
            <span style={{ minWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {x.label}
            </span>
            <span style={s.sliceTrack}>
              <span
                style={s.sliceBar(total > 0 ? (x.cost_usd / total) * 100 : 0, SLICE_COLORS[i % SLICE_COLORS.length] ?? "var(--text-tertiary)")}
              />
            </span>
            <span style={s.sliceCost}>{usd(x.cost_usd)}</span>
          </div>
        ))
      )}
    </div>
  );
}
