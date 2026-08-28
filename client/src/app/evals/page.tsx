import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /evals (Eval Dashboard, spec 13 R8). Thin route entry — the view, its
   styles, helpers and i18n are colocated under _components/EvalDashboardView. */
export default function EvalsPage() {
  return <EvalDashboardView />;
}
