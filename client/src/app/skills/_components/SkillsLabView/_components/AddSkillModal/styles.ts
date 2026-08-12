import type { CSSProperties } from "react";

/** Co-located styles for AddSkillModal. */
export const s = {
  body: { padding: "18px 22px 4px" } satisfies CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    padding: "12px 18px",
  } satisfies CSSProperties,
  count: (over: boolean): CSSProperties => ({
    fontSize: 11.5,
    color: over ? "var(--crit)" : "var(--text-muted)",
    fontWeight: over ? 600 : 400,
  }),
  error: { fontSize: 12, color: "var(--crit)", marginBottom: 12 } satisfies CSSProperties,
  filePicker: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  // The native input is the only file picker available — the UI kit has none —
  // so it is hidden and driven by a Button that matches the rest of the modal.
  fileInput: { display: "none" } satisfies CSSProperties,
  fileName: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
