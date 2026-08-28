/* NewEvalCaseModal — the eval case editor, opened from a decided finding
   (spec 13, R1 + R2; mockup N3).

   Two columns: the pinned INPUT on the left (diff / files / PR meta) and the
   EXPECTED output on the right, with the actual output below it once the case
   has been run. The case kind is DERIVED from the decision — accepted →
   must_find, dismissed → must_not_flag — and shown as a banner rather than a
   control: offering it as a choice would let the set disagree with the
   decisions it was built from.

   Portalled to <body> on purpose. The only place this opens from is a DECIDED
   finding's card, and that card is styled `opacity: .6; overflow: hidden` to
   mute it — a modal rendered inside it inherits both and comes out washed out
   and clipped. Fixed positioning does not escape an opacity ancestor; a portal
   does. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Modal,
  FormField,
  TextInput,
  Tabs,
  Button,
  Badge,
  Skeleton,
  ErrorState,
  Icon,
} from "@devdigest/ui";
import type { EvalCase, EvalOwnerKind, FindingRecord } from "@devdigest/shared";
import {
  useCreateEvalCase,
  useCreateManualEvalCase,
  useDryRunEvalCase,
  useEvalCasePreview,
  useUpdateEvalCase,
} from "@/lib/hooks";
import { notify } from "@/lib/toast";
import { s } from "./styles";

const INPUT_TABS = ["Diff", "Files", "PR meta"];

/**
 * Where this editor was opened from. One component covers all three because the
 * design has one (`design-mocks/src/23-screen_cizruns.jsx:55`) — the differences
 * are what is seeded and whether the input is editable, not the layout.
 *
 *  finding — seeded from a decided finding; the diff is PINNED and read-only,
 *            because a case whose input can change after the fact stops being a
 *            regression test.
 *  manual  — nothing to seed; the diff is typed in.
 *  edit    — an existing row; name and expectation are editable, input is not.
 */
export type EvalCaseSource =
  | { kind: "finding"; finding: FindingRecord }
  | { kind: "manual"; ownerKind: EvalOwnerKind; ownerId: string }
  | { kind: "edit"; evalCase: EvalCase };

export function EvalCaseEditor({
  source,
  agentId,
  onClose,
}: {
  source: EvalCaseSource;
  agentId?: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("prReview");
  const f = source.kind === "finding" ? source.finding : null;
  const preview = useEvalCasePreview(f?.id ?? null);
  const create = useCreateEvalCase();
  const createManual = useCreateManualEvalCase();
  const update = useUpdateEvalCase();
  // Only a finding pins its input. Anything else types it, and `edit` shows the
  // stored one without letting it move.
  const [diff, setDiff] = React.useState(
    source.kind === "edit" ? (source.evalCase.input_diff ?? "") : "",
  );
  const diffEditable = source.kind === "manual";
  const [tab, setTab] = React.useState(INPUT_TABS[0]!);
  const [name, setName] = React.useState("");
  const [expected, setExpected] = React.useState("");
  const mustFind = !!f?.accepted_at;

  // Seed the editable fields once, from the server's derivation. Re-seeding on
  // every render of the query would overwrite whatever the user typed.
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current) return;
    if (source.kind === "edit") {
      seeded.current = true;
      setName(source.evalCase.name);
      setExpected(JSON.stringify(source.evalCase.expected_output ?? [], null, 2));
      return;
    }
    if (source.kind === "manual") {
      seeded.current = true;
      // A skeleton, not `[]`. An empty array is valid JSON that asserts
      // nothing, so the box looked broken and Save sat disabled with no
      // explanation — the mock shows a populated expectation for the same
      // reason (design-mocks/src/23-screen_cizruns.jsx:58).
      setExpected(
        JSON.stringify(
          [{ kind: "must_find", file: "", start_line: 1, end_line: 1 }],
          null,
          2,
        ),
      );
      return;
    }
    if (!preview.data) return;
    seeded.current = true;
    setName(preview.data.name);
    setExpected(JSON.stringify([preview.data.expectation], null, 2));
  }, [preview.data, source]);

  const dry = useDryRunEvalCase();
  // `Run on save` is off by default: a save is cheap and a run is a model call,
  // and a toggle that spends money without being asked is the wrong default.
  const [runOnSave, setRunOnSave] = React.useState(false);
  const resolvedAgentId = agentId ?? preview.data?.agent?.id ?? null;

  /** The input this case runs against, whichever way the editor was opened. */
  const inputDiff =
    source.kind === "finding" ? (preview.data?.input_diff ?? "") : diff;
  const fallbackName = preview.data?.name ?? f?.title ?? name;

  const runCase = () => {
    if (!resolvedAgentId || !parsedExpected.ok) return;
    dry.mutate({
      agentId: resolvedAgentId,
      name: name.trim() || fallbackName,
      input_diff: inputDiff,
      expected_output: parsedExpected.value,
    });
  };

  /**
   * Three states, not two. `[]` parses fine and asserts nothing — calling that
   * "invalid JSON" sent people looking for a syntax error that was not there.
   */
  const parsedExpected = React.useMemo(() => {
    if (!expected.trim()) return { ok: false as const, reason: "empty" as const };
    try {
      const value = JSON.parse(expected);
      if (!Array.isArray(value)) return { ok: false as const, reason: "shape" as const };
      if (value.length === 0) return { ok: false as const, reason: "empty" as const };
      return { ok: true as const, value };
    } catch {
      return { ok: false as const, reason: "syntax" as const };
    }
  }, [expected]);

  /** The mock's `Finding skeleton` button: a valid expectation to edit rather
      than an empty box. Seeded from the finding when there is one, and a blank
      shape when there is not — which is the whole reason this beats a form of
      fields: a case may assert several things. */
  const addSkeleton = () => {
    const skeleton = f
      ? {
          kind: mustFind ? "must_find" : "must_not_flag",
          file: f.file,
          start_line: f.start_line,
          end_line: f.end_line,
          title: f.title,
        }
      : { kind: "must_find", file: "", start_line: 1, end_line: 1 };
    const current = parsedExpected.ok ? parsedExpected.value : [];
    setExpected(JSON.stringify([...current, skeleton], null, 2));
  };

  const submit = () => {
    if (!parsedExpected.ok) return;

    if (source.kind === "edit") {
      update.mutate(
        {
          caseId: source.evalCase.id,
          agentId: resolvedAgentId ?? source.evalCase.owner_id,
          name: name.trim() || source.evalCase.name,
          expected_output: parsedExpected.value,
        },
        { onSuccess: onClose },
      );
      return;
    }

    if (source.kind === "manual") {
      createManual.mutate(
        {
          owner_kind: source.ownerKind,
          owner_id: source.ownerId,
          name: name.trim() || "untitled case",
          input_diff: diff,
          expected_output: parsedExpected.value,
        },
        { onSuccess: onClose },
      );
      return;
    }

    create.mutate(
      {
        findingId: f!.id,
        name: name.trim() || fallbackName,
        expected_output: parsedExpected.value,
        agentId: resolvedAgentId,
      },
      {
        onSuccess: (res) => {
          notify.success(res.created ? t("evalCase.created") : t("evalCase.existed"));
          // Save first, then run — in that order, so a run always has a saved
          // case behind it. The modal stays open while the run is in flight;
          // closing it would throw away the only place the result is shown.
          if (runOnSave && resolvedAgentId) {
            runCase();
            return;
          }
          onClose();
        },
        // Errors surface through the global ApiError toast; the modal stays
        // open so the JSON the user edited is not thrown away with it.
      },
    );
  };

  return createPortal(
    <Modal
      width={920}
      title={t("evalCase.title")}
      subtitle={mustFind ? t("evalCase.seededAccepted") : t("evalCase.seededDismissed")}
      onClose={onClose}
      footer={
        <div style={s.evalModalFooter}>
          <label style={s.evalRunOnSave}>
            <input
              type="checkbox"
              checked={runOnSave}
              onChange={(e) => setRunOnSave(e.target.checked)}
              disabled={!resolvedAgentId}
            />
            {t("evalCase.runOnSave")}
          </label>
          <span style={{ flex: 1 }} />
          <Button kind="ghost" size="sm" onClick={onClose} disabled={create.isPending}>
            {t("evalCase.cancel")}
          </Button>
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            // No agent means nothing to run against: the finding came from a
            // review whose agent row is gone.
            disabled={!resolvedAgentId || !parsedExpected.ok || dry.isPending || preview.isLoading}
            onClick={runCase}
          >
            {dry.isPending ? t("evalCase.running") : t("evalCase.runCase")}
          </Button>
          <Button
            kind="primary"
            size="sm"
            icon="Check"
            onClick={submit}
            disabled={create.isPending || !parsedExpected.ok || preview.isLoading}
          >
            {source.kind === "edit" ? t("evalCase.save") : t("evalCase.create")}
          </Button>
        </div>
      }
    >
      {source.kind === "finding" && preview.isError ? (
        <div style={s.evalPad}>
          <ErrorState title={t("evalCase.previewFailed")} body={String(preview.error)} />
        </div>
      ) : (
        <div style={s.evalGrid}>
          {/* ---- left: the input this case pins ---- */}
          <div style={s.evalLeft}>
            <div style={s.evalPadTop}>
              {/* Only a finding-seeded case has a decision to restate. A
                  hand-written one asserts whatever its JSON says, and inventing
                  a "positive case" banner for it would be a claim nobody made. */}
              {f && (
                <div style={s.evalBanner(mustFind)}>
                  <div style={s.evalBannerLabel(mustFind)}>
                    {mustFind ? t("evalCase.positiveCase") : t("evalCase.negativeCase")}
                  </div>
                  <div style={s.evalBannerBody}>
                    {mustFind ? t("evalCase.mustFindLine") : t("evalCase.mustNotFlagLine")}{" "}
                    <b>&ldquo;{f.title}&rdquo;</b> {t("evalCase.at")}{" "}
                    <span style={s.evalMono}>
                      {f.file}:{f.start_line}
                    </span>
                  </div>
                </div>
              )}
              <FormField label={t("evalCase.name")} required>
                <TextInput
                  value={name}
                  onChange={setName}
                  placeholder={t("evalCase.namePlaceholder")}
                />
              </FormField>
              <div style={s.evalSectionLabel}>{t("evalCase.input")}</div>
            </div>
            <Tabs tabs={INPUT_TABS} value={tab} onChange={setTab} pad="0 16px" />
            <div style={s.evalTabBody}>
              {preview.isLoading ? (
                <Skeleton height={180} />
              ) : tab === "Diff" ? (
                // Pinned when it came from a finding; typed in when it did not.
                diffEditable ? (
                  <textarea
                    value={diff}
                    onChange={(e) => setDiff(e.target.value)}
                    placeholder={t("evalCase.diffPlaceholder")}
                    spellCheck={false}
                    style={s.evalDiffInput}
                  />
                ) : (
                  <DiffPre text={inputDiff} />
                )
              ) : tab === "Files" ? (
                <div style={s.evalFileList}>
                  {(preview.data?.input_files ?? []).map((path) => (
                    <div key={path} style={s.evalFile(path === f?.file)}>
                      {path}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={s.evalMeta}>
                  <FormField label={t("evalCase.prTitle")}>
                    <TextInput value={preview.data?.pr.title ?? ""} readOnly />
                  </FormField>
                  <FormField label={t("evalCase.prNumber")}>
                    <TextInput value={`#${preview.data?.pr.number ?? ""}`} mono readOnly />
                  </FormField>
                  <FormField label={t("evalCase.headSha")} hint={t("evalCase.inputHint")}>
                    <TextInput value={preview.data?.pr.head_sha ?? "—"} mono readOnly />
                  </FormField>
                </div>
              )}
            </div>
          </div>

          {/* ---- right: what the agent must (not) say ---- */}
          <div style={s.evalRight}>
            <div style={s.evalRightHead}>
              <span style={s.evalSectionLabel}>{t("evalCase.expectedOutput")}</span>
              {parsedExpected.ok ? (
                <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                  {t("evalCase.validJson")}
                </Badge>
              ) : (
                <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertTriangle">
                  {t(
                    parsedExpected.reason === "syntax"
                      ? "evalCase.invalidJson"
                      : parsedExpected.reason === "shape"
                        ? "evalCase.notAList"
                        : "evalCase.noExpectations",
                  )}
                </Badge>
              )}
              <div style={s.evalRightActions}>
                <Button kind="ghost" size="sm" icon="Plus" onClick={addSkeleton}>
                  {t("evalCase.findingSkeleton")}
                </Button>
              </div>
            </div>
            <textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              spellCheck={false}
              style={s.evalJson}
            />

            {/* Design: design-mocks/src/23-screen_cizruns.jsx:92 — one line
                that says whether the last run passed and what it cost, not a
                dump of the model's JSON. The numbers are what tells you the
                expectation is one this agent can actually meet. */}
            <div style={s.evalResult(dry.data?.result.traces_passed === 1)}>
              {dry.isPending ? (
                t("evalCase.running")
              ) : dry.isError ? (
                <span>{String(dry.error)}</span>
              ) : dry.data ? (
                <>
                  {dry.data.result.traces_passed === 1 ? (
                    <Icon.CheckCircle size={16} style={{ color: "var(--ok)" }} />
                  ) : (
                    <Icon.XCircle size={16} style={{ color: "var(--crit)" }} />
                  )}
                  <span>
                    <b>
                      {t(
                        dry.data.result.traces_passed === 1
                          ? "evalCase.lastRunPassed"
                          : "evalCase.lastRunFailed",
                      )}
                    </b>{" "}
                    {t("evalCase.resultLine", {
                      expected: Array.isArray(parsedExpected.ok ? parsedExpected.value : [])
                        ? (parsedExpected.ok ? parsedExpected.value : []).length
                        : 0,
                      got: dry.data.findings.length,
                      seconds: (dry.data.result.duration_ms / 1000).toFixed(1),
                      cost: (dry.data.result.cost_usd ?? 0).toFixed(2),
                    })}
                  </span>
                </>
              ) : (
                // "Never run yet" is not "no findings" — an absent result and an
                // empty one are different answers.
                <span>{t("evalCase.neverRun")}</span>
              )}
            </div>
            <div style={s.evalSectionLabel}>{t("evalCase.actualOutput")}</div>
            {/* A case created here has by definition never run: there is no run
                endpoint yet (spec 13, R3), so this states the absence rather
                than showing a zero, which would be a different claim. */}
            <div style={s.evalActual}>{t("evalCase.neverRun")}</div>
          </div>
        </div>
      )}
    </Modal>,
    document.body,
  );
}

/** Unified-diff colouring: added lines green, removed red, hunk headers accent. */
function DiffPre({ text }: { text: string }) {
  const lines = React.useMemo(() => text.split("\n"), [text]);
  return (
    <pre style={s.evalDiff}>
      {lines.map((l, i) => (
        <div key={i} style={s.evalDiffLine(l)}>
          {l || " "}
        </div>
      ))}
    </pre>
  );
}
