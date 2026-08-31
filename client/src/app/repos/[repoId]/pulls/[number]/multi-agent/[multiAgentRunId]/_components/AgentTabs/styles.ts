import type { CSSProperties } from "react";

/** Co-located styles for AgentTabs (design-mocks/src/19-screen_multiagent.jsx:67-90). */
export const s = {
  bar: {
    display: "flex",
    gap: 2,
    padding: "0 28px",
    borderBottom: "1px solid var(--border)",
    overflowX: "auto",
  } satisfies CSSProperties,
  tab: (active: boolean, color: string) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "12px 16px",
      border: "none",
      background: "transparent",
      borderBottom: `2px solid ${active ? color : "transparent"}`,
      marginBottom: -1,
      cursor: "pointer",
      whiteSpace: "nowrap",
    }) satisfies CSSProperties,
  tabName: (active: boolean) =>
    ({
      fontSize: 13,
      fontWeight: active ? 600 : 500,
      color: active ? "var(--text-primary)" : "var(--text-secondary)",
    }) satisfies CSSProperties,
  body: { padding: "20px 28px", maxWidth: 760 } satisfies CSSProperties,
  banner: (color: string) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 16px",
      borderRadius: 9,
      border: "1px solid var(--border)",
      background: "var(--bg-elevated)",
      marginBottom: 18,
      borderLeft: `3px solid ${color}`,
    }) satisfies CSSProperties,
  bannerName: (color: string) => ({ fontSize: 14, fontWeight: 600, color }) satisfies CSSProperties,
  bannerSummary: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 } satisfies CSSProperties,
  bannerAside: {
    marginLeft: "auto",
    textAlign: "right",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  bannerMeta: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  findingsList: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  errorBanner: {
    padding: "14px 16px",
    borderRadius: 9,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    marginBottom: 18,
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
