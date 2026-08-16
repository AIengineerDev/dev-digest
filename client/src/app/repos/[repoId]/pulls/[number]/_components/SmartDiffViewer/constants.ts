/** Constants for SmartDiffViewer. */

import type { SmartDiffRole } from "@devdigest/shared";

/**
 * Role → the colour of its group marker. Three deliberately different hues, not
 * a severity ramp: a boilerplate file is not a *safe* file, it is a file whose
 * risk the reviewer cannot assess by reading it.
 */
export const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  wiring: "var(--warn)",
  boilerplate: "var(--text-muted)",
};

/**
 * Roles whose files start expanded. Boilerplate is the one that never does —
 * an acceptance criterion, not a preference: a 4000-line lock diff at the top
 * of an open card is the exact failure Smart Diff exists to prevent.
 */
export const EXPANDED_ROLES: readonly SmartDiffRole[] = ["core"];

/**
 * A core file bigger than this stays collapsed anyway, unless it carries a
 * finding. Matches the diff-viewer's own `AUTO_EXPAND_MAX_LINES`, kept as a
 * separate constant because the two answer different questions and may diverge.
 */
export const EXPAND_MAX_LINES = 200;

/**
 * Separator for the `path`+`line` index key.
 *
 * A NUL can never occur in a path, so the key is unambiguous — but written as a
 * raw byte in the source it makes the whole file **binary to git**, which hides
 * every future diff of it from review. Spelled as an escape, the file stays
 * text and the key is byte-identical.
 */
export const KEY_SEP = "\u0000";

/** Severity used for a flagged line the client cannot match to a finding —
 *  the server says the line is flagged, so the badge must still appear. */
export const UNKNOWN_MARK_SEVERITY = "WARNING" as const;
