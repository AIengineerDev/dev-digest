/* hooks/ barrel — every React Query hook over the F1/feature APIs.
   Import from "@/lib/hooks" for the platform hooks (settings/repos/pulls/context)
   or from a domain file directly (e.g. "@/lib/hooks/reviews") — both resolve here.

   Named re-exports only: a wildcard hides what this module actually offers and
   makes every consumer's import graph reach all five domain files. */

export {
  useSettings,
  useUpdateSettings,
  useTestConnection,
  useSecretsStatus,
  useRepos,
  useAddRepo,
  useRefreshRepo,
  useDeleteRepo,
  usePulls,
  usePullDetail,
  useContextFiles,
  useReindexContext,
} from "./core";

export {
  useAgents,
  useAgent,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useAgentSkills,
  useSetAgentSkills,
  useProviderModels,
} from "./agents";
export type { CreateAgentInput, UpdateAgentInput, SetAgentSkillsInput } from "./agents";

export {
  useSkills,
  useSkill,
  useSkillVersions,
  useSkillVersion,
  useCreateSkill,
  useUpdateSkill,
  useDeleteSkill,
} from "./skills";
export type { SkillListFilters, UpdateSkillVariables } from "./skills";

export {
  usePrActiveRuns,
  usePrRuns,
  usePrReviews,
  useDeleteRun,
  useCancelRun,
  useDeleteReview,
  usePrComments,
  useCreatePrComment,
  useRunReview,
  useFindingAction,
  useRunEvents,
} from "./reviews";
export type { ActiveRun, CreateCommentInput, RunReviewInput } from "./reviews";

export { useRunTrace } from "./trace";

export { useRepoIntelStatus, useResyncRepoIntel } from "./repo-intel";
export type { RepoIntelState } from "./repo-intel";
