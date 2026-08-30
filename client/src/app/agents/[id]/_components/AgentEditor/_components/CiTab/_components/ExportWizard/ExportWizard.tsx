/* ExportWizard — the four-step Target -> Preview -> Configure -> Install
   modal (R2). Step state is local `React.useState`; `repo` is lifted to
   `CiTab` so closing mid-wizard and reopening starts at Target with the repo
   prefilled (C6) without committing anything. Generate once on leaving
   Target, hold the result in state, and never send it back — Install
   regenerates server-side (R3). */
"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { Agent, CiFile } from "@devdigest/shared";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import { useGenerateCiFiles, useInstallCi, useSecretsStatus } from "@/lib/hooks";
import { POST_AS_OPTIONS, STEP_LABELS } from "./constants";
import { buildExportInput, isRepoValid, toggleTrigger } from "./helpers";
import { TargetStep } from "./steps/TargetStep";
import { PreviewStep } from "./steps/PreviewStep";
import { ConfigureStep } from "./steps/ConfigureStep";
import { InstallStep } from "./steps/InstallStep";
import { s } from "./styles";

export function ExportWizard({
  agent,
  repo,
  onRepoChange,
  onClose,
}: {
  agent: Agent;
  repo: string;
  onRepoChange: (v: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("ci.exportWizard");
  const dialogRef = React.useRef<HTMLDivElement>(null);

  const [step, setStep] = React.useState(0);
  const [triggers, setTriggers] = React.useState<string[]>(["opened", "synchronize", "reopened"]);
  const [postAs, setPostAs] = React.useState<(typeof POST_AS_OPTIONS)[number]>("github_review");
  const [files, setFiles] = React.useState<CiFile[] | null>(null);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [genError, setGenError] = React.useState<string | null>(null);

  const generate = useGenerateCiFiles();
  const install = useInstallCi();
  const secretsStatus = useSecretsStatus();

  // Focus lands inside the modal on open; Escape closes it (Modal itself,
  // vendored, does neither — client/src/vendor/ui/** is do-not-touch).
  React.useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const runGenerate = React.useCallback(async () => {
    setGenError(null);
    try {
      const result = await generate.mutateAsync({
        agentId: agent.id,
        input: buildExportInput({ repo, triggers, postAs, action: "files" }),
      });
      setFiles(result);
      setSelectedPath(result[result.length - 1]?.path ?? null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setGenError(err?.message ?? String(err));
    }
    // triggers/postAs only affect the workflow file's bytes, not whether
    // generation can run — re-running on every keystroke would defeat R3's
    // "generate once". Only `repo` and an explicit Retry re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id, repo]);

  const goNext = () => {
    if (step === 0) {
      setStep(1);
      void runGenerate();
      return;
    }
    setStep((s2) => Math.min(s2 + 1, 3));
  };

  const goBack = () => setStep((s2) => Math.max(s2 - 1, 0));

  const runInstall = async () => {
    await install.mutateAsync({
      agentId: agent.id,
      input: buildExportInput({ repo, triggers, postAs, action: "open_pr" }),
    });
  };

  const canContinue =
    step === 0 ? isRepoValid(repo) : step === 1 ? !generate.isPending && !genError && !!files : true;

  return (
    <Modal
      width={720}
      title={t("title")}
      subtitle={t("subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {step > 0 && !install.data && (
            <Button kind="ghost" icon="ChevronLeft" onClick={goBack}>
              {t("back")}
            </Button>
          )}
          <div style={s.footerRight}>
            {step < 3 ? (
              <Button kind="primary" iconRight="ArrowRight" onClick={goNext} disabled={!canContinue}>
                {t("continue")}
              </Button>
            ) : (
              !install.data && (
                <Button
                  kind="primary"
                  icon="Check"
                  onClick={runInstall}
                  disabled={install.isPending}
                  loading={install.isPending}
                >
                  {install.isPending ? t("installing") : t("install")}
                </Button>
              )
            )}
          </div>
        </div>
      }
    >
      <div style={s.stepBar} ref={dialogRef} tabIndex={-1}>
        <ExportWizardSteps step={step} labels={STEP_LABELS.map((k) => t(`steps.${k}`))} />
      </div>
      <div style={s.stepBody}>
        {step === 0 && <TargetStep t={t} repo={repo} onRepoChange={onRepoChange} />}
        {step === 1 && (
          <PreviewStep
            t={t}
            files={files}
            generating={generate.isPending}
            error={genError}
            onRetry={runGenerate}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
          />
        )}
        {step === 2 && (
          <ConfigureStep
            t={t}
            provider={agent.provider}
            manifestPath={files?.find((f) => f.path.startsWith(".devdigest/agents/"))?.path ?? ""}
            triggers={triggers}
            onToggleTrigger={(type) => setTriggers((cur) => toggleTrigger(cur, type))}
            postAs={postAs}
            onPostAsChange={setPostAs}
            secretsStatus={secretsStatus.data}
          />
        )}
        {step === 3 && (
          <InstallStep
            t={t}
            repo={repo}
            files={files}
            installing={install.isPending}
            installError={install.isError ? (install.error as Error).message : null}
            prUrl={install.data?.pr_url ?? null}
            onRetry={runInstall}
          />
        )}
      </div>
    </Modal>
  );
}
