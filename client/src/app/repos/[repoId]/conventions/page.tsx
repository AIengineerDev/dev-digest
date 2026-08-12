import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (N7 Conventions extractor, specs/03-conventions).
   Thin route entry — the scan, the candidate list and the "create skill" modal
   are colocated under _components/ConventionsView. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
