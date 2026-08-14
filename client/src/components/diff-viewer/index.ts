/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   optional review-finding annotations.
   Public surface: the DiffViewer component, the DiffCommentApi contract, and
   the annotation types Smart Diff builds. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffAnnotations, DiffFindingMark, DiffReveal } from "./annotations";
