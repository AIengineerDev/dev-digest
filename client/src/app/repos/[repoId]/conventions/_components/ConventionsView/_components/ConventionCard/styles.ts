import type { CSSProperties } from "react";
import { CONFIDENCE_BAR_WIDTH } from "../../constants";

/** Co-located styles for ConventionCard (ported from design-mocks/src/25). */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: 16,
    marginBottom: 12,
  } satisfies CSSProperties,
  decided: { opacity: 0.6 } satisfies CSSProperties,
  row: { display: "flex", gap: 14 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } satisfies CSSProperties,
  rule: {
    fontSize: 14,
    fontWeight: 600,
    fontStyle: "italic",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  rationale: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    marginTop: 6,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  evidence: {
    marginTop: 10,
    borderRadius: 7,
    border: "1px solid var(--border)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "5px 10px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 11.5,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    background: "var(--code-bg)",
    overflow: "auto",
  } satisfies CSSProperties,
  confidence: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  } satisfies CSSProperties,
  confidenceLabel: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  confidenceBar: { width: CONFIDENCE_BAR_WIDTH } satisfies CSSProperties,
  confidenceValue: { fontSize: 11, color: "var(--text-secondary)" } satisfies CSSProperties,
  buttons: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    flexShrink: 0,
    width: 150,
  } satisfies CSSProperties,
  editor: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  editorActions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
