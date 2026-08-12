import type { CSSProperties } from "react";

/** Co-located styles for SkillEditor (centre pane). */
export const s = {
  pane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 14px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,
  headerIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  count: (over: boolean): CSSProperties => ({
    fontSize: 11.5,
    color: over ? "var(--crit)" : "var(--text-muted)",
    fontWeight: over ? 600 : 400,
  }),
  textarea: {
    flex: 1,
    width: "100%",
    minHeight: 0,
    resize: "none",
    padding: "12px 16px",
    border: "none",
    outline: "none",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 12.5,
    lineHeight: "21px",
  } satisfies CSSProperties,
  limitError: {
    padding: "8px 14px",
    fontSize: 12,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,
  skeleton: {
    flex: 1,
    padding: 28,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
} as const;
