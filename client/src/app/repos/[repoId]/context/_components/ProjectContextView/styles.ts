import type { CSSProperties } from "react";
import { CONTENT_MAX_WIDTH, RAIL_WIDTH } from "./constants";

/** Co-located styles for ProjectContextView. */
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
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 3,
  } satisfies CSSProperties,
  body: {
    display: "flex",
    gap: 20,
    alignItems: "flex-start",
  } satisfies CSSProperties,
  rail: {
    width: RAIL_WIDTH,
    flexShrink: 0,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  pane: {
    flex: 1,
    minWidth: 0,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    minHeight: 480,
  } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 10, padding: 14 } satisfies CSSProperties,
} as const;
