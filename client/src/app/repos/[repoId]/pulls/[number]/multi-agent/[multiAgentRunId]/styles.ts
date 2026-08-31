import type { CSSProperties } from "react";

/** Co-located styles for the multi-agent results page.
   Page frame per `specs/14-multi-agent-review.md` § Design conformance: the
   results screen uses the app's own frame (`PageContainer`'s numbers), not the
   mock's — only `Configure run` uses the mock's narrower 720px frame. */
export const s = {
  header: {
    padding: "18px 28px 4px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  } satisfies CSSProperties,
  configureButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  viewSwitch: {
    marginLeft: "auto",
    display: "flex",
    gap: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 2,
  } satisfies CSSProperties,
  viewButton: (active: boolean) =>
    ({
      padding: "4px 12px",
      fontSize: 11.5,
      fontWeight: 600,
      borderRadius: 5,
      border: "none",
      textTransform: "capitalize",
      background: active ? "var(--bg-elevated)" : "transparent",
      color: active ? "var(--text-primary)" : "var(--text-muted)",
      cursor: "pointer",
    }) satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 28px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  prNumber: { color: "var(--text-muted)" } satisfies CSSProperties,
  prTitle: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  metaRight: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  columnsGrid: (n: number) =>
    ({
      display: "grid",
      gridTemplateColumns: `repeat(${Math.min(n, 5)}, minmax(220px, 1fr))`,
      gap: 12,
      overflowX: n > 5 ? "auto" : "visible",
    }) satisfies CSSProperties,
  columnsBody: { padding: "20px 28px 40px" } satisfies CSSProperties,
} as const;
