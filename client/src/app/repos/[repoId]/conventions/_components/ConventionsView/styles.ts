import type { CSSProperties } from "react";
import { CONTENT_MAX_WIDTH } from "./constants";

/** Co-located styles for ConventionsView. */
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
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  counts: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  error: {
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 14,
  } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
