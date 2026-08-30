/* AgentPickerPopover — "PICK AGENTS TO RUN" (R1). A sibling popover, not an
   extension of @devdigest/ui's Dropdown: that primitive only renders flat
   `DropdownItemDef[]` buttons and closes on every click (`kit/Dropdown.tsx`,
   `kit/types.ts`), which cannot host a multi-select. `vendor/ui/**` stays
   untouched — this owns its own open state and outside-click handling, mirroring
   `Dropdown`'s mechanics rather than importing it. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { POPOVER_WIDTH } from "./constants";
import { s } from "./styles";

export function AgentPickerPopover({
  prId,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const params = useParams<{ repoId: string; number: string }>();
  const { data: agents } = useAgents();
  const run = useRunReview();
  const [open, setOpen] = React.useState(false);
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const ref = React.useRef<HTMLDivElement>(null);

  const enabled = React.useMemo(() => (agents ?? []).filter((a) => a.enabled), [agents]);

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clear() {
    setChecked(new Set());
  }

  async function runMultiAgent() {
    const agentIds = [...checked];
    if (agentIds.length === 0) return;
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, agentIds });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
      setOpen(false);
      clear();
      if (res.multi_agent_run_id) {
        router.push(
          `/repos/${params.repoId}/pulls/${params.number}/multi-agent/${res.multi_agent_run_id}`,
        );
      }
    } finally {
      onRunSettled?.();
    }
  }

  if (enabled.length === 0) return null;

  return (
    <div ref={ref} style={s.wrapper}>
      <Button kind="secondary" size="sm" icon="Users" iconRight="ChevronDown" onClick={() => setOpen((o) => !o)}>
        {t("runReview.pickAgents")}
      </Button>
      {open && (
        <div style={{ ...s.panel, width: POPOVER_WIDTH }}>
          <div style={s.heading}>{t("runReview.pickAgentsHeading")}</div>
          <div style={s.list}>
            {enabled.map((a) => (
              <Checkbox key={a.id} checked={checked.has(a.id)} onChange={() => toggle(a.id)} label={a.name} />
            ))}
          </div>
          <div style={s.actions}>
            <Button kind="secondary" size="sm" onClick={clear} disabled={checked.size === 0}>
              {t("runReview.clear")}
            </Button>
            <Button
              kind="primary"
              size="sm"
              loading={run.isPending}
              disabled={checked.size === 0}
              onClick={() => void runMultiAgent()}
            >
              {t("runReview.runMultiAgent", { count: checked.size })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
