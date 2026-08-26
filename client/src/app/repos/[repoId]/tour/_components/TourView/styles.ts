import type { CSSProperties } from "react";
import { CONTENT_MAX_WIDTH, RAIL_WIDTH } from "./constants";

/** Co-located styles for TourView. */
export const s = {
  page: {
    padding: "20px 28px 40px",
    maxWidth: CONTENT_MAX_WIDTH,
    margin: "0 auto",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginTop: 5,
  } satisfies CSSProperties,
  headerActions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  body: {
    display: "flex",
    gap: 28,
    alignItems: "flex-start",
  } satisfies CSSProperties,
  rail: {
    width: RAIL_WIDTH,
    flexShrink: 0,
    position: "sticky",
    top: 16,
  } satisfies CSSProperties,
  railLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 10,
  } satisfies CSSProperties,
  railLink: (dim: boolean) =>
    ({
      display: "block",
      fontSize: 12.5,
      color: dim ? "var(--text-muted)" : "var(--text-secondary)",
      fontWeight: 500,
      padding: "5px 0",
      borderLeft: "2px solid transparent",
      paddingLeft: 11,
      marginLeft: -2,
      textDecoration: "none",
    }) satisfies CSSProperties,
  content: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 10, padding: 14 } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 16,
  } satisfies CSSProperties,
  bannerText: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, flex: 1 } satisfies CSSProperties,
  notIndexed: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    padding: "60px 28px",
    gap: 8,
  } satisfies CSSProperties,
  notIndexedTitle: { fontSize: 15, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  notIndexedActions: { display: "flex", gap: 8, marginTop: 12 } satisfies CSSProperties,
} as const;
