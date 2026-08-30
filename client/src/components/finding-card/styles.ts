import type { CSSProperties } from "react";

/** Co-located styles for FindingCard (extracted from inline styles). */
export const s = {
  card: (focused: boolean, sevColor: string, muted: boolean): CSSProperties => ({
    borderRadius: 8,
    // Per-side longhands, and that means per-SIDE: `borderColor` and
    // `borderWidth` are themselves shorthands for all four sides, so pairing
    // either with a `borderLeft*` longhand triggers React's "updating a style
    // property during rerender when a conflicting property is set" warning the
    // moment `focused` flips. The left edge carries the severity colour and is
    // thicker, so the other three sides are written out individually.
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: focused ? sevColor : "var(--border)",
    borderRightColor: focused ? sevColor : "var(--border)",
    borderBottomColor: focused ? sevColor : "var(--border)",
    borderLeftWidth: 3,
    borderLeftColor: sevColor,
    background: "var(--bg-elevated)",
    overflow: "hidden",
    opacity: muted ? 0.6 : 1,
    transition: "opacity .2s, border-color .12s, box-shadow .12s",
    boxShadow: focused ? "0 0 0 1px " + sevColor : "none",
  }),
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 16px",
    cursor: "pointer",
  } satisfies CSSProperties,
  badgeWrap: { paddingTop: 1 } satisfies CSSProperties,
  headerMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  title: (muted: boolean, dismissed: boolean): CSSProperties => ({
    fontSize: 14,
    fontWeight: 600,
    color: muted ? "var(--text-muted)" : "var(--text-primary)",
    textDecoration: dismissed ? "line-through" : "none",
  }),
  acceptedTag: { fontSize: 12, fontWeight: 600, color: "var(--ok)" } satisfies CSSProperties,
  dismissedTag: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 5,
  } satisfies CSSProperties,
  chevron: (expanded: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: expanded ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    marginTop: 2,
    flexShrink: 0,
  }),
  body: { padding: "14px 16px 16px", borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  trifectaWrap: { marginBottom: 14 } satisfies CSSProperties,
  prose: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  suggestionWrap: { marginTop: 14 } satisfies CSSProperties,
  suggestionLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    marginBottom: 8,
    textTransform: "uppercase",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 14,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  composer: {
    marginTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  composerActions: { display: "flex", gap: 8 } satisfies CSSProperties,
  evalPad: { padding: 24 } satisfies CSSProperties,
  evalModalFooter: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
  } satisfies CSSProperties,
  /* Two panes of equal weight: the input the case pins, and what it asserts.
     Fixed height so the diff scrolls inside the modal rather than growing it. */
  evalGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    height: 480,
  } satisfies CSSProperties,
  evalLeft: {
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  } satisfies CSSProperties,
  evalRight: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    padding: "14px 16px 16px",
    gap: 8,
  } satisfies CSSProperties,
  evalPadTop: {
    padding: "14px 16px 0",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  /* The derived kind, stated as a fact about the decision already made. */
  evalBanner: (mustFind: boolean): CSSProperties => ({
    padding: "10px 12px",
    borderRadius: 8,
    background: mustFind ? "var(--ok-bg)" : "var(--warn-bg)",
    border: `1px solid ${mustFind ? "var(--ok)" : "var(--warn)"}`,
  }),
  evalBannerLabel: (mustFind: boolean): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: mustFind ? "var(--ok)" : "var(--warn)",
    marginBottom: 4,
  }),
  evalBannerBody: {
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  evalMono: { fontFamily: "var(--font-mono)", fontSize: 11.5 } satisfies CSSProperties,
  evalSectionLabel: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  evalTabBody: {
    flex: 1,
    overflow: "auto",
    padding: "12px 16px",
    minHeight: 0,
  } satisfies CSSProperties,
  evalDiff: {
    margin: 0,
    fontFamily: "var(--font-mono)",
    fontSize: 11.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  evalDiffLine: (line: string): CSSProperties => ({
    background:
      line.startsWith("+") && !line.startsWith("+++")
        ? "var(--code-add)"
        : line.startsWith("-") && !line.startsWith("---")
          ? "var(--code-del)"
          : "transparent",
    color: line.startsWith("@@") ? "var(--accent-text)" : "inherit",
  }),
  evalFileList: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  /* The finding's own file is the one whose diff this case pins; the rest are
     listed so the reader can see what the case deliberately leaves out. */
  evalFile: (isSource: boolean): CSSProperties => ({
    fontFamily: "var(--font-mono)",
    fontSize: 11.5,
    padding: "4px 6px",
    borderRadius: 5,
    color: isSource ? "var(--accent-text)" : "var(--text-secondary)",
    background: isSource ? "var(--accent-bg)" : "transparent",
  }),
  evalMeta: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  evalRightHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  evalRightActions: { marginLeft: "auto", display: "flex", gap: 6 } satisfies CSSProperties,
  evalJson: {
    flex: 1,
    minHeight: 0,
    resize: "none",
    padding: 12,
    fontFamily: "var(--font-mono)",
    fontSize: 11.5,
    lineHeight: 1.55,
    background: "var(--code-bg)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    outline: "none",
  } satisfies CSSProperties,
  evalRunOnSave: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  evalActualMetrics: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    marginBottom: 6,
  } satisfies CSSProperties,
  evalActualJson: {
    margin: 0,
    fontSize: 11.5,
    whiteSpace: "pre-wrap",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  evalActual: {
    padding: "11px 13px",
    borderRadius: 8,
    border: "1px dashed var(--border-strong)",
    color: "var(--text-muted)",
    fontSize: 12.5,
    height: 96,
  } satisfies CSSProperties,
} as const;
