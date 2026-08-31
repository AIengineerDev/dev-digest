/** Constants for the ci module — pure values, no logic. */
import type { Provider, SecretKey } from '@devdigest/shared';

/**
 * Provider → repo-secret name, duplicated from
 * `server/src/modules/settings/constants.ts:9-13` rather than imported.
 * `no-cross-module-internals` (`.dependency-cruiser.cjs:70`) forbids a module
 * reaching into another module's files, and this map has no home in
 * `@devdigest/shared` or `modules/_shared/` today — moving it there is a
 * contract-adjacent decision this plan does not make. Restricted to `Provider`
 * (the agent's provider — no `github` entry), which also fixes the audit note
 * that `github` must never be offered as an export secret.
 */
export const SECRET_KEY_BY_PROVIDER: Record<Provider, SecretKey> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/**
 * Third-party actions used by the generated workflow, pinned to a full commit
 * SHA — never a floating tag (R5, Decision 9). The comment names the tag each
 * SHA corresponds to, so a future bump is a deliberate, reviewable edit.
 */
export const CHECKOUT_ACTION_SHA = 'b4ffde65f46336ab88eb53be808477a3936bae11'; // actions/checkout@v4.1.1
export const SETUP_NODE_ACTION_SHA = '60edb5dd545a775178f52524783378180af0d1f8'; // actions/setup-node@v4.0.2

/** Node version pinned for the setup-node step. */
export const NODE_VERSION = '20';

/**
 * Path the export commits the bundled runner to, and what the generated
 * workflow's run step invokes. The bytes come from `agent-runner/dist/index.js`
 * (Phase 2's ncc bundle, gitignored — a build artifact, never committed to this
 * repo), read at Install time — see `service.ts#readRunnerBundle`. It is not
 * one of the previewed `CiFile[]` (A4 counts only the manifest, skill files and
 * workflow) — it ships alongside them in the actual commit because it is
 * runtime infrastructure, not agent config the user chose to export.
 */
export const RUNNER_COMMIT_PATH = '.devdigest/runner.mjs';

/** Where the ncc bundle lands after `cd agent-runner && npm run build`, resolved
 *  from the server process's cwd (`server/`, per `server/AGENTS.md`). */
export const RUNNER_BUNDLE_PATH = '../agent-runner/dist/index.js';

/** Max bytes for a single generated file (NFR Scale). */
export const MAX_FILE_BYTES = 1024 * 1024; // 1 MB

/** The only two `post_as` values v1 supports (R14). */
export const SUPPORTED_POST_AS = ['github_review', 'none'] as const;
