import type { CSSProperties } from "react";

/** Co-located styles for the Agent Editor → Evals tab. CSS variables, not
 *  imported tokens: that is how every other tab in this editor is written. */
export const s = {
  wrap: { maxWidth: 720, display: "grid", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  sub: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,

  tiles: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
  } satisfies CSSProperties,
  tile: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 12,
    display: "grid",
    gap: 4,
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 11,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  } satisfies CSSProperties,
  tileValue: { fontSize: 24, fontWeight: 700 } satisfies CSSProperties,
  delta: (up: boolean | null): CSSProperties => ({
    fontSize: 11.5,
    color: up === null ? "var(--text-muted)" : up ? "var(--success)" : "var(--danger)",
  }),

  historyHead: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 11,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 10,
  } satisfies CSSProperties,
  rowMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowName: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  rowMeta: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  rowActions: (shown: boolean): CSSProperties => ({
    display: "flex",
    gap: 2,
    opacity: shown ? 1 : 0.4,
  }),
  modalFooter: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
  modalBody: { padding: 18, display: "grid", gap: 8 } satisfies CSSProperties,
  fieldLabel: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  fieldHead: { display: "flex", alignItems: "center", gap: 8, marginTop: 6 } satisfies CSSProperties,
  json: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    minHeight: 220,
    padding: 10,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--code-bg)",
    color: "var(--text-primary)",
    resize: "vertical",
  } satisfies CSSProperties,
  metric: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,
} as const;
