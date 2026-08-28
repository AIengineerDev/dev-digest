/* Eval Dashboard → one agent (spec 13, R8 detail).
   Design: design-mocks/src/14-screen_skills.jsx:131 (`ScreenEval`). */
"use client";

import { use } from "react";
import { AgentEvalView } from "./_components/AgentEvalView";

export default function AgentEvalPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  return <AgentEvalView agentId={agentId} />;
}
