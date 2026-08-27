/**
 * project-context discovery — filesystem walk over a clone directory for
 * `.md`/`.markdown` documents (specs/09-project-context.md R1).
 *
 * Moved to `_shared/doc-discovery.ts` (specs/12-onboarding-generator.md T2):
 * `modules/tour` needs the same discovery and `no-cross-module-internals`
 * forbids importing it from here. Re-exported so this module's existing
 * importers (`service.ts`) and tests (`test/project-context/discovery.test.ts`)
 * are unchanged.
 */
export {
  discoverDocuments,
  type DiscoveredDoc,
  type DiscoveryResult,
} from '../_shared/doc-discovery.js';
