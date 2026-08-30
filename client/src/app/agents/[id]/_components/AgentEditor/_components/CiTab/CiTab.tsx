/* CiTab — Export to CI (spec 15, R1). Shows `Add to CI`, this agent's
   `ci_installations` rows (or the empty state), and the `Fail CI on` gate —
   the CI tab's own copy of the control `ConfigTab` already ships, both
   writing the same `agents.ci_fail_on` field (spec 15 Requirement audit,
   R1 row). No job statuses, no history table — that is spec 14's CI Runs
   page, out of scope here. */
"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { Badge, Button, ErrorState, SelectInput, Skeleton } from "@devdigest/ui";
import { useCiInstallations, useUpdateAgent } from "@/lib/hooks";
import { CI_FAIL_ON_VALUES } from "./constants";
import { formatInstalledAt } from "./helpers";
import { s } from "./styles";
import { ExportWizard } from "./_components/ExportWizard";

/** DOM id for the "Add to CI" trigger button — used to return focus to it
 *  when the wizard closes (C6 / NFR Accessibility); the vendored `Button`
 *  does not forward a ref, so an id + `getElementById` stands in for one. */
const ADD_TO_CI_BUTTON_ID = "ci-tab-add-to-ci";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  // The label + option copy is the same control `ConfigTab` already ships —
  // reused rather than duplicated (agents.json `config.ciFailOn*`).
  const tAgents = useTranslations("agents");
  const installations = useCiInstallations(agent.id);
  const update = useUpdateAgent();
  const [wizardOpen, setWizardOpen] = React.useState(false);
  // Lifted above the wizard so closing mid-wizard and reopening starts at
  // Target with the repo prefilled (C6) instead of reset to empty.
  const [repo, setRepo] = React.useState("");

  const closeWizard = () => {
    setWizardOpen(false);
    document.getElementById(ADD_TO_CI_BUTTON_ID)?.focus();
  };

  const failOnOptions = CI_FAIL_ON_VALUES.map((v) => ({
    value: v,
    label: tAgents(`config.ciFailOnOptions.${v}`),
  }));

  if (installations.isLoading) return <Skeleton />;
  if (installations.isError) {
    return <ErrorState title={t("loadFailed")} body={String(installations.error)} />;
  }
  const rows = installations.data ?? [];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("ciTab.heading")}</h2>
        {rows.length > 0 && (
          <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
            {t("ciTab.activeCount", { count: rows.length })}
          </Badge>
        )}
        {/* Always the same label regardless of installation state (spec 15
            Requirement audit, R2 row: "use the existing ciTab.exportToCi
            copy... do not hardcode 'Add to CI'"). */}
        <Button
          id={ADD_TO_CI_BUTTON_ID}
          kind="primary"
          size="sm"
          icon="Plus"
          style={{ marginLeft: "auto" }}
          onClick={() => setWizardOpen(true)}
        >
          {t("ciTab.exportToCi")}
        </Button>
      </div>
      <div style={s.subtitle}>{t("ciTab.subtitle")}</div>

      <div style={s.failOnBox}>
        <div style={s.rowMain}>
          <div style={s.failOnLabel}>{tAgents("config.ciFailOn")}</div>
          <div style={s.failOnHint}>{tAgents("config.ciFailOnHint")}</div>
        </div>
        <div style={s.failOnSelect}>
          <SelectInput
            value={agent.ci_fail_on}
            onChange={(v) => update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
            options={failOnOptions}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={s.emptyBox}>{t("ciTab.empty")}</div>
      ) : (
        <div style={s.list}>
          {rows.map((row) => (
            <div key={row.id} style={s.row}>
              <div style={s.rowMain}>
                <div className="mono" style={s.rowRepo}>
                  {row.repo}
                </div>
                <div style={s.rowMeta}>{t("ciTab.installed", { date: formatInstalledAt(row.installed_at) })}</div>
              </div>
              <Badge color="var(--text-secondary)">{row.target_type === "gha" ? "GitHub Actions" : row.target_type}</Badge>
            </div>
          ))}
        </div>
      )}

      {wizardOpen && (
        <ExportWizard agent={agent} repo={repo} onRepoChange={setRepo} onClose={closeWizard} />
      )}
    </div>
  );
}
