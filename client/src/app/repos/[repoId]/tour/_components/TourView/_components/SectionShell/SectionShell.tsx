"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";
import type { OnboardingSectionKind } from "@devdigest/shared";
import { s } from "./styles";

/**
 * The shared per-section chrome: a real `<button aria-expanded aria-controls>`
 * header (Accessibility NFR), the anchor `id` the rail links to, and the
 * empty/skeleton slot. One component per section consumes this rather than
 * one component with a five-way switch — the five payloads share nothing but
 * `title`, and a switch means every section's change re-tests the other four.
 */
export function SectionShell({
  kind,
  icon,
  title,
  emptyReason,
  skeletonMarker,
  children,
}: {
  kind: OnboardingSectionKind;
  icon: IconName;
  title: string;
  /** A named empty message (C5/C6/C7) — renders instead of `children`, never
   *  a hidden section (a hidden section makes a partial tour look complete). */
  emptyReason?: string | null;
  /** Quiet "no summary generated" marker (R24) when this section has no
   *  model-authored prose but its derived facts still render. */
  skeletonMarker?: string | null;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const I = Icon[icon];
  const Chevron = Icon.ChevronDown;
  const panelId = `${kind}-panel`;

  return (
    <section id={kind} style={s.section}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        style={s.header}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={s.iconBox}>
          <I size={15} />
        </span>
        <h3 style={s.title}>{title}</h3>
        <Chevron size={16} style={s.chevron(open)} />
      </button>
      {open && (
        <div id={panelId} style={s.panel}>
          {emptyReason ? (
            <p style={s.empty}>{emptyReason}</p>
          ) : (
            <>
              {skeletonMarker && <p style={s.marker}>{skeletonMarker}</p>}
              {children}
            </>
          )}
        </div>
      )}
    </section>
  );
}
