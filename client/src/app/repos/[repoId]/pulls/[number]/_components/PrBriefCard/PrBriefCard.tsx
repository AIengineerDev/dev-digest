"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, Button, ErrorState, Icon } from "@devdigest/ui";
import type { ReviewFocusItem, ReviewRecord, Risk, RiskSeverity } from "@devdigest/shared";
import { useBrief, useGenerateBrief } from "../../../../../../../lib/hooks";
import { ApiError } from "../../../../../../../lib/api";
import { formatCostUsd } from "../../../../../../../lib/format";
import { isStaleRun, shortSha } from "../staleness";
import { blockersAtHead, reviewsAtHead, scoreAtHead } from "../reviewsAtHead";
import { visibleRisks, iconForRiskKind, truncateMiddle } from "./helpers";
import { FOCUS_DISPLAY_CAP, REF_MAX_CHARS, WHAT_MAX_CHARS } from "./constants";
import { s } from "./styles";

const RISK_LEVEL_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

/**
 * PR Overview → Brief card (specs/10-pr-brief.md). Stacked above `IntentCard`
 * (Q4). States: still loading (nothing, so the card does not flash an empty
 * state on its way to a filled one — same reasoning as `IntentCard`), a query
 * error (never falls through to the "not generated" empty branch — the
 * defect `client/INSIGHTS.md` (2026-08-09) records against
 * `RunReviewDropdown`), not yet generated (an offer to generate), degraded
 * (never a blank card — the error plus Retry, which sends `force: true` per
 * spec amendment A-2 so a matching cache key does not just hand the same
 * failure back), and populated.
 */
export function PrBriefCard({
  prId,
  reviews,
  headSha,
  onFocusFile,
}: {
  prId: string;
  /** The PR's reviews and current head, so the counts row is folded
   *  client-side (R13) — a persisted count would freeze at generation time. */
  reviews?: ReviewRecord[] | undefined;
  headSha?: string | null;
  /** Jumps to a `kind: 'file'` review-focus entry in the diff (wired by the
   *  page, B3). Absent = the entry still renders, just without a click. */
  onFocusFile?: (path: string) => void;
}) {
  const t = useTranslations("brief");
  const { data: brief, isLoading, isError, error, refetch } = useBrief(prId);
  const generate = useGenerateBrief(prId);

  if (isLoading) return null;

  if (isError) {
    return (
      <section>
        <SectionLabel icon="FileText">{t("title")}</SectionLabel>
        <ErrorState
          title={t("loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("loadErrorBody")}
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  // Not generated yet. `null` is a normal state, same reasoning as
  // `usePrIntent` — but a blank page cannot say that, and there is no other
  // way to trigger the first generation.
  if (!brief) {
    return (
      <section>
        <SectionLabel icon="FileText">{t("title")}</SectionLabel>
        <div style={s.wrap}>
          <div style={s.degradedRow}>
            <div>
              <p style={s.why}>{t("unavailable")}</p>
              <p style={s.why}>{t("unavailableHint")}</p>
            </div>
            <Button
              kind="secondary"
              size="sm"
              icon="Sparkles"
              loading={generate.isPending}
              onClick={() => generate.mutate(false)}
            >
              {t("generate")}
            </Button>
          </div>
          {generate.isError && (
            <p style={s.degradedText}>
              {t("generateFailed", {
                error: generate.error instanceof Error ? generate.error.message : "",
              })}
            </p>
          )}
        </div>
      </section>
    );
  }

  if (brief.degraded) {
    return (
      <section>
        <SectionLabel icon="Info">{t("title")}</SectionLabel>
        <div style={s.wrap}>
          <div style={s.degradedRow}>
            <p style={s.degradedText}>{t("degraded", { error: brief.error ?? "" })}</p>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={generate.isPending}
              // A degraded record's cache key is unchanged, so a plain retry
              // would just serve the same degraded row back (R6's "unless
              // degraded" exception — spec amendment A-2).
              onClick={() => generate.mutate(true)}
            >
              {t("retry")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // ---- Populated ----
  const { shown: shownRisks, hidden: hiddenRisks } = visibleRisks(brief.risks);
  const what = truncateMiddle(brief.what, WHAT_MAX_CHARS);
  const stale = isStaleRun(brief.head_sha, headSha);
  const atHead = reviewsAtHead(reviews, headSha);
  const score = scoreAtHead(reviews, headSha);
  const blockers = blockersAtHead(reviews, headSha);
  const findingsCount = atHead.reduce((n, r) => n + r.findings.length, 0);
  const focusItems = brief.review_focus.slice(0, FOCUS_DISPLAY_CAP);

  // Nothing has changed since this row was generated (same cache key), so a
  // regenerate would just serve the same brief back — same reasoning as
  // `specs/04-intent-layer.md:204-206`'s Recalculate, adopted here as a
  // disabled control rather than an enabled one that silently no-ops.
  const regenerateDisabled = generate.isPending || !stale;

  return (
    <section>
      <SectionLabel
        icon="FileText"
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={generate.isPending}
            disabled={regenerateDisabled}
            title={regenerateDisabled && !generate.isPending ? t("regenerateDisabledReason") : undefined}
            onClick={() => generate.mutate(true)}
          >
            {t("regenerate")}
          </Button>
        }
      >
        {t("title")}
      </SectionLabel>
      <div style={s.wrap}>
        <div style={s.headRow}>
          <Badge color={RISK_LEVEL_COLOR[brief.risk_level]} dot>
            {t(`riskLevel.${brief.risk_level}`)}
          </Badge>
          {stale && (
            <Badge color="var(--text-muted)" bg="var(--bg-hover)" icon="History">
              {t("stale", { sha: shortSha(brief.head_sha) })}
            </Badge>
          )}
        </div>
        <p style={s.what} title={brief.what.length > WHAT_MAX_CHARS ? brief.what : undefined}>
          {what}
        </p>
        {brief.why && <p style={s.why}>{brief.why}</p>}

        {brief.risks.length === 0 ? (
          <p style={s.why}>{t("noRisks")}</p>
        ) : (
          <div style={s.section}>
            <span style={s.sectionTitle}>{t("risksTitle")}</span>
            <div style={s.riskList}>
              {shownRisks.map((risk, i) => (
                <RiskPill key={i} risk={risk} onFocusFile={onFocusFile} />
              ))}
            </div>
            {hiddenRisks > 0 && <span style={s.why}>{t("moreRisks", { count: hiddenRisks })}</span>}
          </div>
        )}

        {focusItems.length > 0 && (
          <div style={s.section}>
            <span style={s.sectionTitle}>{t("reviewFocusTitle")}</span>
            <ol style={s.focusList}>
              {focusItems.map((item, i) => (
                <FocusEntry key={i} item={item} onFocusFile={onFocusFile} />
              ))}
            </ol>
          </div>
        )}

        <div style={s.section}>
          <div style={s.countsRow}>
            {atHead.length === 0 ? (
              <span>{t("counts.notReviewed")}</span>
            ) : (
              <>
                {score != null && (
                  <Badge mono color="var(--text-secondary)">
                    {t("counts.score")} {score}
                  </Badge>
                )}
                <span>{t("counts.findings", { count: findingsCount })}</span>
                {blockers > 0 && <span>{t("counts.blockers", { count: blockers })}</span>}
              </>
            )}
          </div>
          <span style={s.costLine}>
            {t("cost")}: {formatCostUsd(brief.cost_usd)}
          </span>
          {brief.dropped_inputs.length > 0 && (
            <p style={s.missingInputsLine}>{t("missingInputs", { inputs: brief.dropped_inputs.join(", ") })}</p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * One risk, as a disclosure (R8). Collapsed it is icon + raw `kind` + title;
 * expanded it adds the explanation and the `file_refs` the model grounded the
 * claim on — which is the whole reason a risk is trustworthy, so it must be
 * reachable rather than merely persisted. Each ref is the same jump-to-diff
 * control the review-focus list uses: `groundBrief` has already guaranteed the
 * path is a file this PR actually changes, so the target cannot be dead.
 *
 * A17: the raw `kind` string is rendered verbatim next to the icon. The icon
 * lookup falls back for a `kind` the model invented (`iconForRiskKind`); the
 * label must not, or the specific claim is silently replaced by a generic one.
 */
function RiskPill({ risk, onFocusFile }: { risk: Risk; onFocusFile?: (path: string) => void }) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const RiskIcon = Icon[iconForRiskKind(risk.kind)];
  const Chevron = Icon[open ? "ChevronDown" : "ChevronRight"];
  const color = RISK_LEVEL_COLOR[risk.severity];

  return (
    <div style={s.riskPill(color)}>
      {/* The disclosure control and the disclosed body are SIBLINGS: the refs
          below are buttons of their own, and a button inside a button is
          invalid HTML that browsers silently re-parent. */}
      <button
        type="button"
        style={s.riskToggle}
        aria-expanded={open}
        aria-label={t(open ? "collapseRisk" : "expandRisk", { title: risk.title })}
        onClick={() => setOpen((v) => !v)}
      >
        <RiskIcon size={14} style={s.riskIcon(color)} />
        <span style={s.riskTitleRow}>
          <span style={s.riskKind}>{risk.kind}</span>
          <span style={s.riskTitle}>{risk.title}</span>
        </span>
        <Chevron size={14} style={s.riskChevron} />
      </button>
      {open && (
        <div style={s.riskBody}>
          <span style={s.riskExplanation}>{risk.explanation}</span>
          {risk.file_refs.length > 0 && (
            <span style={s.riskRefs}>
              {risk.file_refs.map((ref) => (
                <button
                  key={ref}
                  type="button"
                  className="mono"
                  style={s.focusButton}
                  title={ref.length > REF_MAX_CHARS ? ref : undefined}
                  onClick={() => onFocusFile?.(ref)}
                >
                  {truncateMiddle(ref, REF_MAX_CHARS)}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FocusEntry({
  item,
  onFocusFile,
}: {
  item: ReviewFocusItem;
  onFocusFile?: (path: string) => void;
}) {
  const ref = truncateMiddle(item.ref, REF_MAX_CHARS);
  const refTitle = item.ref.length > REF_MAX_CHARS ? item.ref : undefined;

  if (item.kind === "file") {
    return (
      <li style={s.focusItem}>
        <button
          type="button"
          className="mono"
          style={s.focusButton}
          title={refTitle}
          onClick={() => onFocusFile?.(item.ref)}
        >
          {ref}
        </button>
        {" — "}
        {item.reason}
      </li>
    );
  }

  // An endpoint entry names a route the model reasoned about, not a page in
  // this app — rendering it as a link or button would be a dead one.
  return (
    <li style={s.focusItem}>
      <span className="mono" title={refTitle}>
        {ref}
      </span>
      {" — "}
      {item.reason}
    </li>
  );
}
