import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context (specs/09-project-context.md, R13).
   Thin route entry — discovery, the left rail, the document pane and the
   Skills/Agents attach tabs are all colocated under _components/ProjectContextView. */
export default function ProjectContextPage() {
  return <ProjectContextView />;
}
