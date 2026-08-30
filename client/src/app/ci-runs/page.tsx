import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs — every agent review executed inside CI rather than in the
   studio. Thin route entry; the view, its styles and its states are colocated. */
export default function CiRunsPage() {
  return <CiRunsView />;
}
