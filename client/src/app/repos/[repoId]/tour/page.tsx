import { TourView } from "./_components/TourView";

/* Route: /repos/:repoId/tour (specs/12-onboarding-generator.md, R20).
   Thin route entry — the "on this page" rail, the five sections and every
   loading/empty/degraded state are colocated under _components/TourView. */
export default function TourPage() {
  return <TourView />;
}
