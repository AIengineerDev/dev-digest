import type { CSSProperties } from "react";

/** Co-located styles for the Agent Editor → CI tab. CSS variables, not
 *  imported tokens — the same convention every other tab in this editor uses.
 *  No page padding or maxWidth of its own (spec 15 "Design conformance" —
 *  the CI tab body inherits whatever the editor already applies). */
export const s = {
  wrap: { maxWidth: 720, display: "grid", gap: 16 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 12.5, color: "var(--text-muted)", marginTop: -8 } satisfies CSSProperties,

  failOnBox: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  failOnLabel: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  failOnHint: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  failOnSelect: { flexShrink: 0, width: 220 } satisfies CSSProperties,

  emptyBox: {
    padding: "40px 24px",
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-secondary)",
    border: "1px dashed var(--border)",
    borderRadius: 10,
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
  rowRepo: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  rowMeta: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
