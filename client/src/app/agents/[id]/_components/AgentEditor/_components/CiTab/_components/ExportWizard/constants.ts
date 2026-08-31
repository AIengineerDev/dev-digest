import type { IconName } from "@devdigest/ui";
import type { CiTarget, Provider } from "@devdigest/shared";

/** `Modal` width the four-step wizard renders at (`design-mocks/src/20-screen_export.jsx:104`). */
export const MODAL_WIDTH = 720;

/** Step bar labels, in order — passed to the vendored `ExportWizardSteps`. */
export const STEP_LABELS = ["target", "preview", "configure", "install"] as const;

/**
 * Target cards (R2). Only `gha` is selectable in v1 — the other three render
 * `coming soon` and stay `aria-disabled`, per `specs/15:84` (Out of scope:
 * "CircleCI, Jenkins, Generic CLI... render `coming soon` and unselectable").
 */
export const CI_TARGET_CARDS: ReadonlyArray<{
  key: CiTarget;
  icon: IconName;
  nameKey: string;
  descKey: string;
  disabled: boolean;
}> = [
  { key: "gha", icon: "Workflow", nameKey: "targets.gha", descKey: "targets.ghaDesc", disabled: false },
  { key: "circle", icon: "RefreshCw", nameKey: "targets.circle", descKey: "targets.circleDesc", disabled: true },
  { key: "jenkins", icon: "Settings", nameKey: "targets.jenkins", descKey: "targets.jenkinsDesc", disabled: true },
  { key: "cli", icon: "Command", nameKey: "targets.cli", descKey: "targets.cliDesc", disabled: true },
];

/** The trigger types the wizard offers — matches `CiExportInput.triggers`'
 *  default (`contracts/eval-ci.ts:330`), all three on by default. */
export const TRIGGER_TYPES = ["opened", "synchronize", "reopened"] as const;

/**
 * `post_as` options v1 offers (R14) — `pr_comment` is a valid contract value
 * but is rejected server-side, so it is never offered here.
 */
export const POST_AS_OPTIONS = ["github_review", "none"] as const;

/**
 * Provider → repo-secret name for display only. A deliberate duplicate of
 * `server/src/modules/ci/constants.ts#SECRET_KEY_BY_PROVIDER` — the client
 * cannot import server internals, and this map has no home in
 * `@devdigest/shared` today (same reasoning the server-side copy records).
 */
export const SECRET_KEY_BY_PROVIDER: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};
