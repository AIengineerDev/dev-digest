"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, Button } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { useDeriveIntent } from "../../../../../../../lib/hooks";
import { commitSubjectCount, unusedSources, usedDocumentationSources } from "./helpers";
import { s } from "./styles";

const BAND_COLOR: Record<PrIntentRecord["band"], string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

/**
 * PR Overview → Intent card (specs/04-intent-layer.md §7). Renders ABOVE the
 * Description section: the derived summary is read first, the raw claim
 * second — same ordering the reviewer prompt uses.
 *
 * Four states: still loading (nothing, so the card does not flash an empty
 * state on its way to a filled one), not yet derived (an offer to derive —
 * `usePrIntent` returning `null` is a normal state, not an error, but a blank
 * page cannot say that and leaves no way to start), degraded (never an empty
 * card — "Not derived — <error>" + Re-derive), and derived (band badge + honest
 * "why" sentence, never a bare confidence number).
 */
export function IntentCard({
  prId,
  intent,
  loading,
}: {
  prId: string;
  intent: PrIntentRecord | null | undefined;
  /** The intent query is in flight. Nothing is rendered while it is. */
  loading?: boolean;
}) {
  const t = useTranslations("prReview.intent");
  const deriveIntent = useDeriveIntent(prId);

  if (loading) return null;

  // Not derived yet. Until this state existed, a PR that had never been
  // reviewed showed no Intent section at all, and there was no way to start
  // one: Recalculate only exists once a row does, so the first derivation was
  // reachable only by running a full review or by calling the API by hand.
  if (!intent) {
    return (
      <section>
        <SectionLabel icon="Target">{t("title")}</SectionLabel>
        <div style={s.wrap(true)}>
          <div style={s.degradedRow}>
            <p style={s.why}>{t("notDerivedYet")}</p>
            <Button
              kind="secondary"
              size="sm"
              icon="Sparkles"
              loading={deriveIntent.isPending}
              onClick={() => deriveIntent.mutate(false)}
            >
              {t("derive")}
            </Button>
          </div>
          {deriveIntent.isError && (
            <p style={s.degradedText}>
              {t("deriveFailed", {
                error:
                  deriveIntent.error instanceof Error ? deriveIntent.error.message : "",
              })}
            </p>
          )}
        </div>
      </section>
    );
  }

  if (intent.degraded) {
    return (
      <section>
        <SectionLabel icon="Info">{t("title")}</SectionLabel>
        <div style={s.wrap(true)}>
          <div style={s.degradedRow}>
            <p style={s.degradedText}>{t("notDerived", { error: intent.error ?? "" })}</p>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={deriveIntent.isPending}
              onClick={() => deriveIntent.mutate(true)}
            >
              {t("reDerive")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const isLow = intent.band === "low";
  const used = usedDocumentationSources(intent.sources);
  const unused = unusedSources(intent.sources);

  const why =
    used.length > 0
      ? t("whyDocumentation", {
          sources: used
            .map((src) =>
              t(`source.${src.kind}` as "source.pr_body", { ref: src.ref ?? "" }),
            )
            .join(", "),
        })
      : t("whyIndirect", { count: commitSubjectCount(intent.sources) });

  return (
    <section>
      <SectionLabel
        icon={isLow ? "Info" : "Target"}
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={deriveIntent.isPending}
            onClick={() => deriveIntent.mutate(true)}
          >
            {t("recalculate")}
          </Button>
        }
      >
        {isLow ? t("inferredTitle") : t("title")}
      </SectionLabel>
      <div style={s.wrap(isLow)}>
        <div style={s.headRow}>
          <Badge color={BAND_COLOR[intent.band]} dot>
            {t(`band.${intent.band}`)}
          </Badge>
          <Badge>{t(`category.${intent.category}`)}</Badge>
        </div>
        {intent.summary && <p style={s.summary}>{intent.summary}</p>}
        <p style={s.why}>{why}</p>

        <div style={s.scopeGrid}>
          <ScopeColumn title={t("inScope")} tone="in" items={intent.in_scope} empty={t("scopeEmpty")} />
          <ScopeColumn
            title={t("outOfScope")}
            tone="out"
            items={intent.out_of_scope}
            empty={t("scopeEmpty")}
          />
        </div>
        {/* The `low` band's whole point is that nothing here is documented, so
            the two columns are a guess about where to look — never a licence to
            call a finding out of scope. Said in the card, as it is said in the
            prompt's low-band preamble. */}
        {isLow && <p style={s.scopeCaution}>{t("scopeInferredNote")}</p>}
        {unused.length > 0 && (
          <details>
            <summary style={s.why}>{t("failedSourcesTitle")}</summary>
            <ul style={s.unusedList}>
              {unused.map((src, i) => (
                <li key={i}>
                  {t(`source.${src.kind}` as "source.pr_body", { ref: src.ref ?? "" })}
                  {src.note ? ` — ${src.note}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

/**
 * One half of the scope pair. Renders even when the model listed nothing:
 * "the model claimed no boundary here" and "we did not ask" look identical if
 * the column disappears, and only the first is true.
 */
function ScopeColumn({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: "in" | "out";
  items: string[];
  empty: string;
}) {
  return (
    <div style={s.scopeCol}>
      <div style={s.scopeTitle(tone)}>{title}</div>
      {items.length === 0 ? (
        <p style={s.scopeEmpty}>{empty}</p>
      ) : (
        <ul style={s.scopeList}>
          {items.map((item, i) => (
            <li key={i} style={s.scopeItem}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
