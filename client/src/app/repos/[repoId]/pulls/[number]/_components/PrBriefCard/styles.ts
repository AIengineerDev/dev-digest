import type { CSSProperties } from "react";

export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  headRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  what: {
    fontSize: 14,
    color: "var(--text)",
    lineHeight: 1.5,
    margin: 0,
  } satisfies CSSProperties,
  why: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  degradedRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  degradedText: {
    fontSize: 13,
    color: "var(--crit)",
    margin: 0,
  } satisfies CSSProperties,
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  riskList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  riskPill: (color: string): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "7px 10px",
    borderRadius: 6,
    background: "var(--bg-hover)",
    border: `1px solid ${color}`,
  }),
  riskIcon: (color: string): CSSProperties => ({ color, flexShrink: 0, marginTop: 1 }),
  riskBody: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    paddingLeft: 22, // aligns the disclosed body under the title, past the icon
  } satisfies CSSProperties,
  /** The pill's whole header is the disclosure control (R8), so the hit target
   *  is the row a reader is already looking at, not a chevron they must aim
   *  for. Transparent + inherited colour: it must not read as a second kind of
   *  button next to the review-focus links. */
  riskToggle: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "pointer",
    color: "inherit",
    font: "inherit",
  } satisfies CSSProperties,
  riskTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  } satisfies CSSProperties,
  /** The raw `Risk.kind` (A17). Free-form model text, so it is shown verbatim
   *  and never mapped away — the icon may fall back, the claim must not. */
  riskKind: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  riskChevron: { color: "var(--text-muted)", flexShrink: 0, marginLeft: "auto" } satisfies CSSProperties,
  riskRefs: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  } satisfies CSSProperties,
  riskTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  riskExplanation: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  focusList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,
  focusItem: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  focusButton: {
    background: "none",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "pointer",
    color: "var(--accent-text, var(--accent))",
    font: "inherit",
  } satisfies CSSProperties,
  countsRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  costLine: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  missingInputsLine: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
    margin: 0,
  } satisfies CSSProperties,
} as const;
