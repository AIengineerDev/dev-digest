/* ConventionCard — one extracted candidate: the rule, the evidence it was
   derived from (linking to that line on GitHub), its confidence, and the three
   verdicts. Editing happens in place: a rule is usually 90% right, and rewriting
   it is cheaper than rejecting it and losing the evidence. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, MonoLink, ProgressBar, SelectInput, Textarea } from "@devdigest/ui";
import type { Convention, ConventionCategory, ConventionStatus } from "@devdigest/shared";
import { CATEGORY_OPTIONS, HIGH_CONFIDENCE, RULE_EDIT_ROWS } from "../../constants";
import { evidenceLabel, evidenceUrl } from "../../helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  convention: Convention;
  repoFullName: string | undefined;
  defaultBranch: string | undefined;
  busy: boolean;
  onDecide: (id: string, status: ConventionStatus) => void;
  onEdit: (id: string, patch: { rule: string; category: ConventionCategory }) => void;
}

export function ConventionCard({
  convention: c,
  repoFullName,
  defaultBranch,
  busy,
  onDecide,
  onEdit,
}: ConventionCardProps) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(c.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(c.category);

  const url = evidenceUrl(repoFullName, c, defaultBranch);
  const pct = Math.round(c.confidence * 100);
  const decided = c.status !== "pending";

  const save = () => {
    setEditing(false);
    if (rule.trim() === c.rule && category === c.category) return;
    onEdit(c.id, { rule: rule.trim(), category });
  };

  const cancel = () => {
    setRule(c.rule);
    setCategory(c.category);
    setEditing(false);
  };

  return (
    <div style={{ ...s.card, ...(decided ? s.decided : {}) }} data-testid="convention-card">
      <div style={s.row}>
        <div style={s.main}>
          <div style={s.meta}>
            <Badge mono>{c.category}</Badge>
            {c.status === "accepted" && (
              <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                {t("card.accepted")}
              </Badge>
            )}
            {c.status === "rejected" && (
              <Badge color="var(--text-muted)" icon="X">
                {t("card.rejected")}
              </Badge>
            )}
          </div>

          {editing ? (
            <div style={s.editor}>
              <Textarea value={rule} onChange={setRule} rows={RULE_EDIT_ROWS} />
              <SelectInput
                value={category}
                onChange={(v) => setCategory(v as ConventionCategory)}
                options={CATEGORY_OPTIONS.map((o) => ({ value: o, label: o }))}
              />
              <div style={s.editorActions}>
                <Button kind="primary" size="sm" onClick={save} disabled={rule.trim() === ""}>
                  {t("card.save")}
                </Button>
                <Button kind="ghost" size="sm" onClick={cancel}>
                  {t("card.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div style={s.rule}>{c.rule}</div>
              {c.rationale && <div style={s.rationale}>{c.rationale}</div>}
            </>
          )}

          <div style={s.evidence}>
            <div style={s.evidenceHead}>
              {/* The link is the claim's receipt: it opens the exact line, at the
                  commit the scan ran against. */}
              <MonoLink href={url}>{evidenceLabel(c)}</MonoLink>
            </div>
            <pre className="mono" style={s.snippet}>
              {c.evidence_snippet}
            </pre>
          </div>

          <div style={s.confidence}>
            <span style={s.confidenceLabel}>{t("card.confidence")}</span>
            <div style={s.confidenceBar}>
              <ProgressBar
                value={pct}
                height={5}
                color={c.confidence >= HIGH_CONFIDENCE ? "var(--ok)" : "var(--warn)"}
              />
            </div>
            <span className="mono tnum" style={s.confidenceValue}>
              {pct}%
            </span>
          </div>
        </div>

        <div style={s.buttons}>
          <Button
            kind="primary"
            size="sm"
            icon="Check"
            full
            disabled={busy || c.status === "accepted"}
            onClick={() => onDecide(c.id, "accepted")}
          >
            {t("card.accept")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="Edit"
            full
            disabled={busy || editing}
            onClick={() => setEditing(true)}
          >
            {t("card.edit")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="X"
            full
            disabled={busy || c.status === "rejected"}
            onClick={() => onDecide(c.id, "rejected")}
          >
            {t("card.reject")}
          </Button>
        </div>
      </div>
    </div>
  );
}
