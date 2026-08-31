/* Step 4 — Install. The single "Open a PR" card is the only option — v1 has
   no "Copy files as a zip" (out of scope), so it stands alone rather than as
   the first of two. On success the PR URL is the primary action
   (`publishDialog.openPr`). */
"use client";

import { Badge, Button, ErrorState, Icon } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { s } from "../styles";
import type { TFunc } from "../types";

export function InstallStep({
  t,
  repo,
  files,
  installing,
  installError,
  prUrl,
  onRetry,
}: {
  t: TFunc;
  repo: string;
  files: CiFile[] | null;
  installing: boolean;
  installError: string | null;
  prUrl: string | null;
  onRetry: () => void;
}) {
  if (prUrl) {
    return (
      <div style={s.installDoneBox}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t("installedTitle")}</div>
        <Button kind="primary" icon="GitPullRequest" onClick={() => window.open(prUrl, "_blank", "noopener")}>
          {t("openPr")}
        </Button>
      </div>
    );
  }
  if (installError) {
    return <ErrorState title={t("installFailedTitle")} body={installError} onRetry={onRetry} />;
  }

  return (
    <div style={s.installWrap}>
      <div style={s.installCard}>
        <div style={s.installCardHead}>
          <Icon.GitPullRequest size={18} style={{ color: "var(--accent)" }} />
          <span style={s.installCardTitle}>{t("installCardTitle")}</span>
          <Badge color="var(--accent-text)" bg="var(--bg-elevated)" style={{ marginLeft: "auto" }}>
            {t("recommended")}
          </Badge>
        </div>
        <p style={s.installCardBody}>
          {t("installCardBody", { repo, count: files?.length ?? 0 })}
        </p>
      </div>
      {installing && <p style={s.installHelp}>{t("installing")}</p>}
    </div>
  );
}
