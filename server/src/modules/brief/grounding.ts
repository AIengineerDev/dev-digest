/**
 * Pure grounding gate (R4) — same reason `reviewer-core`'s `groundFindings` is
 * separate from the review service (`reviewer-core/src/index.ts:23`): a
 * validation gate that is a private method inside a service cannot be tested
 * without a container, and this is the requirement most likely to be quietly
 * loosened later.
 *
 * The reference set is the caller's responsibility to build correctly — see
 * `service.ts`'s "assembled input, not the database" comment (audit row: R4).
 * This file only checks membership and drops what does not resolve.
 */
import { normalizePath } from '../_shared/file-roles.js';
import type { Brief, Risk, ReviewFocusItem } from '@devdigest/shared';

export interface GroundBriefInput {
  readonly brief: Brief;
  /** The PR's changed file paths as they survived `assemble.ts`'s drop order,
   *  PLUS `BlastRadius.changed_symbols[].file` — never the raw DB file list,
   *  so a dropped `boilerplate` file is correctly no longer a valid ref. */
  readonly referenceFiles: readonly string[];
  /** `BlastRadius.downstream[].endpoints_affected[]` strings. */
  readonly referenceEndpoints: readonly string[];
}

export interface GroundBriefResult {
  readonly brief: Brief;
  /** Total ref/entry count dropped across `risks[].file_refs` and `review_focus`. */
  readonly droppedRefs: number;
  /** The offending strings, for the run log. */
  readonly dropped: string[];
  /** `review_focus.length` BEFORE grounding — the C2-vs-C13 branch needs this
   *  alongside the grounded length to tell "the model said nothing" from
   *  "the model said things and all of them were wrong". */
  readonly focusReturned: number;
  readonly focusKept: number;
}

export function groundBrief(input: GroundBriefInput): GroundBriefResult {
  const files = new Set(input.referenceFiles.map(normalizePath));
  const endpoints = new Set(input.referenceEndpoints);

  const dropped: string[] = [];
  let droppedRefs = 0;

  const risks: Risk[] = input.brief.risks.map((risk) => {
    const keptRefs = risk.file_refs.filter((ref) => {
      const ok = files.has(normalizePath(ref));
      if (!ok) {
        droppedRefs++;
        dropped.push(ref);
      }
      return ok;
    });
    return { ...risk, file_refs: keptRefs };
  });

  const focusReturned = input.brief.review_focus.length;
  const groundedFocus: ReviewFocusItem[] = input.brief.review_focus.filter((entry) => {
    const ok = entry.kind === 'file' ? files.has(normalizePath(entry.ref)) : endpoints.has(entry.ref);
    if (!ok) {
      droppedRefs++;
      dropped.push(entry.ref);
    }
    return ok;
  });

  return {
    brief: { ...input.brief, risks, review_focus: groundedFocus },
    droppedRefs,
    dropped,
    focusReturned,
    focusKept: groundedFocus.length,
  };
}
