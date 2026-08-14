/**
 * Caps for the blast radius response.
 *
 * A blast radius is unbounded by nature — one changed utility can be called
 * from three hundred places — and both consumers are size-sensitive: the
 * Overview card has to stay a card, and `get_blast_radius` is pasted into a
 * model's context. Truncation is therefore the normal case, not the error case,
 * and the counts in the summary are always the **untruncated** ones so a cap is
 * never read as the whole answer.
 */

/**
 * Changed symbols reported. A PR touching more distinct symbols than this is
 * not one a reviewer reads symbol-by-symbol anyway — Smart Diff's split
 * suggestion is the better tool at that size.
 */
export const MAX_CHANGED_SYMBOLS = 60;

/**
 * Callers listed per changed symbol. Past a dozen the list stops being
 * "who to check" and becomes "this is load-bearing", which the count already
 * says on its own.
 */
export const MAX_CALLERS_PER_SYMBOL = 12;

/** Endpoints listed per changed symbol. Same reasoning as callers. */
export const MAX_ENDPOINTS_PER_SYMBOL = 12;
