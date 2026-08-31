import type { CSSProperties } from "react";

/** Co-located styles for RunConfig (design-mocks/src/19-screen_multiagent.jsx:93-149).
   Container centres at maxWidth 720 — narrower than the results view, on
   purpose (the design's own choice, per `spec` § Design conformance). */
export const s = {
  container: { padding: "24px 28px 40px", maxWidth: 720, margin: "0 auto" } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  lead: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, marginBottom: 22 } satisfies CSSProperties,
  stepRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } satisfies CSSProperties,
  badge: (reachable: boolean) =>
    ({
      width: 22,
      height: 22,
      borderRadius: 99,
      background: reachable ? "var(--accent-bg)" : "var(--bg-hover)",
      color: reachable ? "var(--accent-text)" : "var(--text-muted)",
      fontSize: 12,
      fontWeight: 700,
      display: "grid",
      placeItems: "center",
    }) satisfies CSSProperties,
  stepLabel: (reachable: boolean) =>
    ({
      fontSize: 13.5,
      fontWeight: 600,
      color: reachable ? "var(--text-primary)" : "var(--text-muted)",
    }) satisfies CSSProperties,
  selectAll: {
    marginLeft: "auto",
    border: "none",
    background: "transparent",
    color: "var(--accent-text)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  } satisfies CSSProperties,
  stepBody: { marginLeft: 32, marginBottom: 24 } satisfies CSSProperties,
  agentList: { marginLeft: 32, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  placeholder: {
    marginLeft: 32,
    padding: "34px 20px",
    borderRadius: 10,
    border: "1px dashed var(--border-strong)",
    background: "var(--bg-elevated)",
    textAlign: "center",
  } satisfies CSSProperties,
  placeholderIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    background: "var(--bg-hover)",
    display: "grid",
    placeItems: "center",
    margin: "0 auto 12px",
  } satisfies CSSProperties,
  placeholderTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  placeholderBody: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginTop: 5,
    maxWidth: 320,
    marginInline: "auto",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  runBar: { display: "flex", alignItems: "center", gap: 14, marginTop: 26, marginLeft: 32 } satisfies CSSProperties,
  estimate: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
