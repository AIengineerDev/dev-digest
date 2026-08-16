import type { CSSProperties } from "react";
import { ROLE_COLOR } from "./constants";
import type { SmartDiffRole } from "@devdigest/shared";

/** Co-located styles for SmartDiffViewer. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 2px",
  } satisfies CSSProperties,
  groupLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  groupHint: { fontSize: 12, color: "var(--text-muted)", flex: 1, minWidth: 0 } satisfies CSSProperties,
  groupCount: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  // Deliberately not the split banner's warning colour: nothing is wrong with
  // the diff, the reviewer is just being told what this view cannot show.
  staleBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  staleText: { fontSize: 12.5, color: "var(--text-secondary)", flex: 1, minWidth: 0 } satisfies CSSProperties,
  staleAction: {
    flexShrink: 0,
    padding: "2px 9px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--accent)",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  } satisfies CSSProperties,
  splitBanner: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  splitTitle: { fontSize: 13, fontWeight: 600, color: "var(--warn)" } satisfies CSSProperties,
  splitBody: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  splitList: { margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: {
    padding: 24,
    fontSize: 14,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
} as const;

/** The square colour marker beside a group's label. */
export function groupMarkerFor(role: SmartDiffRole): CSSProperties {
  return {
    width: 9,
    height: 9,
    borderRadius: 2,
    flexShrink: 0,
    background: ROLE_COLOR[role],
  };
}
