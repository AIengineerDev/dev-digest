"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { OnboardingSection } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { SectionShell } from "../SectionShell";
import { s } from "./styles";

/**
 * Architecture overview (R2). `diagram` is rendered from directory-level
 * import edges the server aggregates in code — the model never authors it
 * (R2, R23) — and renders no container at all when `diagram` is `null` or
 * fails `mermaid.parse` (C4, C10, A21): `MermaidDiagram` already validates
 * with a keyword regex and `mermaid.parse({suppressErrors:true})`.
 */
export function ArchitectureSection({ section }: { section: OnboardingSection }) {
  const t = useTranslations("onboarding");
  const marker = !section.empty_reason && section.skeleton ? t("skeleton.sectionMarker") : null;

  return (
    <SectionShell
      kind="architecture_overview"
      icon="Boxes"
      title={section.title}
      emptyReason={section.empty_reason}
      skeletonMarker={marker}
    >
      {section.body && <Markdown>{section.body}</Markdown>}
      {section.diagram && (
        <div style={s.diagramWrap}>
          <MermaidDiagram chart={section.diagram} />
          <span style={s.srOnly}>
            {t("diagramAlt", { dirs: (section.tree ?? []).map((d) => d.path || "/").join(", ") })}
          </span>
        </div>
      )}
      {section.tree && section.tree.length > 0 && (
        <div style={s.treeList}>
          {section.tree.map((d) => (
            <div key={d.path} style={s.treeRow}>
              <span className="mono" style={s.treePath}>
                {d.path || "/"}
              </span>
              <span style={s.treeMeta}>
                {d.files} files{d.top_file ? ` · ${d.top_file}` : ""}
              </span>
              {d.note && <p style={s.treeNote}>{d.note}</p>}
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
