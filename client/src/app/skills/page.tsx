import { SkillsLabView } from "./_components/SkillsLabView";

/* Route: /skills (Skills Lab). Thin route entry — the two panes (list + body
   editor), their styles, constants, helpers and i18n are colocated under
   _components/SkillsLabView. The mock's third pane (eval) is out of scope for
   v1 and is deliberately absent rather than stubbed — see specs/02-skills.md. */
export default function SkillsPage() {
  return <SkillsLabView />;
}
