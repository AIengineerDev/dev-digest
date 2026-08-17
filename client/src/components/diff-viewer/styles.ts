import type { CSSProperties } from "react";
import type { Line } from "./helpers";
import { SEVERITY_COLOR, SEVERITY_COLOR_FALLBACK } from "./constants";

/** Co-located styles for the DiffViewer (extracted from inline styles). */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: { padding: "24px", fontSize: 14, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  fileCard: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fileHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filePath: {
    fontSize: 13,
    fontWeight: 500,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  fileStat: { fontSize: 12 } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  fileBody: {
    borderTop: "1px solid var(--border)",
    padding: "8px 0",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  noDiff: {
    padding: "14px 18px",
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
  hunk: {
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "0 14px",
  } satisfies CSSProperties,
  lineNo: {
    width: 44,
    textAlign: "right",
    padding: "0 10px 0 0",
    color: "var(--text-muted)",
    userSelect: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
  lineText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
    paddingRight: 12,
  } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the file card is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

/** Row background per line kind (add/del tinted, others transparent).
 *  `severity` (a finding anchored here) adds the severity-coloured left rule;
 *  `revealed` is the line a finding badge was just clicked through to. */
export function lineRowFor(
  kind: Line["kind"],
  opts?: { severity?: string | null; revealed?: boolean },
): CSSProperties {
  const background = kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent";
  const color = opts?.severity ? (SEVERITY_COLOR[opts.severity] ?? SEVERITY_COLOR_FALLBACK) : null;
  return {
    display: "flex",
    alignItems: "stretch",
    fontSize: 13,
    lineHeight: "20px",
    background,
    // 3px of colour in the gutter, and 3px of transparent border everywhere
    // else, so a marked line does not shift the text of its neighbours.
    borderLeft: `3px solid ${color ?? "transparent"}`,
    ...(opts?.revealed
      ? { outline: "1px solid var(--accent)", outlineOffset: -1, background: "var(--accent-bg)" }
      : {}),
  };
}

/** Severity pill rendered at the right edge of a line that carries findings. */
export function severityChipFor(severity: string): CSSProperties {
  const color = SEVERITY_COLOR[severity] ?? SEVERITY_COLOR_FALLBACK;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    alignSelf: "center",
    marginRight: 10,
    padding: "0 6px",
    borderRadius: 4,
    border: `1px solid ${color}`,
    color,
    fontSize: 11,
    lineHeight: "16px",
    whiteSpace: "nowrap",
  };
}

/** "N findings" button in a file header — clickable, so it looks it. */
export function findingBadgeFor(severity: string): CSSProperties {
  const color = SEVERITY_COLOR[severity] ?? SEVERITY_COLOR_FALLBACK;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 7px",
    borderRadius: 999,
    border: `1px solid ${color}`,
    background: "transparent",
    color,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  };
}

/** Gutter sign colour per line kind. */
export function lineSignFor(kind: Line["kind"]): CSSProperties {
  return {
    width: 14,
    textAlign: "center",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-muted)",
    flexShrink: 0,
  };
}
