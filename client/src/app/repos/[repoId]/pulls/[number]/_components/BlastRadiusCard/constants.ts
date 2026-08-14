/** Constants for BlastRadiusCard. */

/**
 * Symbols listed before the card collapses the rest behind "show all".
 *
 * Six is what fits beside the Intent card at the narrowest layout the Overview
 * tab supports without the two columns disagreeing in height. The server caps
 * at 60; this is a display fold, not a data limit.
 */
export const VISIBLE_SYMBOLS = 6;

/** Callers listed under an expanded symbol before the same fold applies. */
export const VISIBLE_CALLERS = 5;

/** Node colours in the graph, matching the legend. */
export const GRAPH_COLOR = {
  changed: "var(--accent)",
  caller: "var(--text-muted)",
  endpoint: "var(--ok)",
} as const;

/** Graph canvas, in SVG user units. The viewBox scales it to the dialog. */
export const GRAPH_WIDTH = 720;
export const GRAPH_HEIGHT = 420;

/** Radius of the ring callers are laid out on around their changed symbol. */
export const GRAPH_ORBIT = 96;
