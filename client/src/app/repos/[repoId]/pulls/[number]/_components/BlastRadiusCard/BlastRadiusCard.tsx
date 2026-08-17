/* BlastRadiusCard — PR Overview → what this change reaches: the symbols it
   modifies, who calls them, and the endpoints and crons downstream.

   Costs nothing to open. The answer comes from the persistent code index via
   GET /pulls/:id/blast — no model call, no GitHub round trip — which is why it
   can render on the Overview tab by default rather than behind a button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Skeleton, ErrorState, Modal } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { BlastGraph } from "./BlastGraph";
import { VISIBLE_CALLERS, VISIBLE_SYMBOLS } from "./constants";
import { baseName, isEmpty, totals } from "./helpers";
import { s } from "./styles";

export function BlastRadiusCard({ prId }: { prId: string }) {
  const t = useTranslations("blast");
  const { data: blast, isLoading, isError, error, refetch } = useBlastRadius(prId);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const [graphOpen, setGraphOpen] = React.useState(false);

  if (isLoading) {
    return (
      <section>
        <SectionLabel icon="GitBranch">{t("title")}</SectionLabel>
        <div style={s.wrap}>
          <Skeleton height={16} width={220} />
          <Skeleton height={64} />
        </div>
      </section>
    );
  }

  if (isError || !blast) {
    return (
      <section>
        <SectionLabel icon="GitBranch">{t("title")}</SectionLabel>
        <ErrorState
          title={t("errorTitle")}
          body={error instanceof ApiError ? error.message : t("errorBody")}
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  const n = totals(blast);
  const empty = isEmpty(blast);
  const shown = showAll ? blast.downstream : blast.downstream.slice(0, VISIBLE_SYMBOLS);
  const hidden = blast.downstream.length - shown.length;

  return (
    <section>
      <SectionLabel icon="GitBranch">{t("title")}</SectionLabel>
      <div style={s.wrap}>
        <div style={s.statRow}>
          <span style={s.stat}>
            <span style={s.statNum}>{n.symbols}</span> {t("stat.symbols")}
          </span>
          <span style={s.stat}>
            <span style={s.statNum}>{n.callers}</span> {t("stat.callers")}
          </span>
          <span style={s.stat}>
            <span style={s.statNum}>{n.endpoints}</span> {t("stat.endpoints")}
          </span>
          {n.crons > 0 && (
            <span style={s.stat}>
              <span style={s.statNum}>{n.crons}</span> {t("stat.crons")}
            </span>
          )}
          <span style={s.spacer} />
          {!empty && (
            <Button kind="secondary" size="sm" onClick={() => setGraphOpen(true)}>
              {t("view.graph")}
            </Button>
          )}
        </div>

        {/* The summary carries the degraded/unimported explanation, so it is
            rendered in every state — including the empty one, where it is the
            only thing that distinguishes "nothing to report" from "could not
            look". */}
        <p style={s.summary}>{blast.summary}</p>

        {!empty && (
          <div style={s.list}>
            {shown.map((d) => {
              const open = expanded === d.symbol;
              const callers = open ? d.callers.slice(0, VISIBLE_CALLERS) : [];
              return (
                <React.Fragment key={d.symbol}>
                  <button
                    type="button"
                    style={s.symbolRow}
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : d.symbol)}
                  >
                    <span className="mono" style={s.symbolGlyph}>
                      ()
                    </span>
                    <span className="mono" style={s.symbolName}>
                      {d.symbol}
                    </span>
                    <span style={s.symbolCount}>{t("callerCount", { count: d.callers.length })}</span>
                  </button>
                  {open && (
                    <div style={s.callerList}>
                      {callers.map((c) => (
                        <span key={`${c.file}:${c.line}`} className="mono" style={s.callerRow}>
                          {c.name} <span style={s.callerLoc}>· {baseName(c.file)}:{c.line}</span>
                        </span>
                      ))}
                      {d.callers.length > callers.length && (
                        <span style={s.callerLoc}>
                          {t("more", { count: d.callers.length - callers.length })}
                        </span>
                      )}
                      {d.callers.length === 0 && <span style={s.callerLoc}>{t("noCallers")}</span>}
                      {d.endpoints_affected.map((e) => (
                        <span key={e} className="mono" style={s.endpointRow}>
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {hidden > 0 && (
              <Button kind="ghost" size="sm" onClick={() => setShowAll(true)}>
                {t("showAll", { count: hidden })}
              </Button>
            )}
          </div>
        )}
      </div>

      {graphOpen && (
        <Modal title={t("title")} subtitle={blast.summary} onClose={() => setGraphOpen(false)}>
          <BlastGraph blast={blast} />
        </Modal>
      )}
    </section>
  );
}
