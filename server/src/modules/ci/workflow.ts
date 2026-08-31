/**
 * The generated `.github/workflows/devdigest-review.yml` — a plain template
 * string, deliberately with no YAML-serializer dependency. That keeps the
 * output exactly deterministic (no library version could ever reorder a key)
 * and keeps this file readable as the security-relevant artifact it is: every
 * `uses:` is a full commit SHA, `permissions:` is explicit and minimal, and
 * nothing from the target PR is interpolated into a `run:` line (R5, R12).
 *
 * `agent-runner/src/index.ts:8-18` is the CLI this invokes — that file's own
 * comment says the same thing back, so the two cannot silently drift apart.
 */
import type { AgentManifest } from '@devdigest/shared';
import { SECRET_KEY_BY_PROVIDER, CHECKOUT_ACTION_SHA, SETUP_NODE_ACTION_SHA, NODE_VERSION, RUNNER_COMMIT_PATH } from './constants.js';

export interface WorkflowInput {
  slug: string;
  manifest: AgentManifest;
  triggers: string[];
}

/**
 * Build the workflow YAML. `triggers` is the raw list from `CiExportInput` —
 * validated shape only (an array of strings); GitHub itself rejects an unknown
 * `pull_request` type at parse time, which is an honest place for that error
 * to surface rather than a second validator here.
 */
export function reviewWorkflow({ slug, manifest, triggers }: WorkflowInput): string {
  const secretKey = SECRET_KEY_BY_PROVIDER[manifest.provider];
  const typesLine = triggers.map((t) => JSON.stringify(t)).join(', ');
  return `name: DevDigest Review
on:
  pull_request:
    types: [${typesLine}]

# Explicit and minimal — everything else defaults to "none". A workflow that
# posts a review and fails a check needs exactly these two.
permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${CHECKOUT_ACTION_SHA} # actions/checkout@v4.1.1
      - uses: actions/setup-node@${SETUP_NODE_ACTION_SHA} # actions/setup-node@v4.0.2
        with:
          node-version: "${NODE_VERSION}"
      # devdigest/review-action@v1 is not published — do not uncomment. The
      # runner is committed into this repository instead (see below).
      # - uses: devdigest/review-action@v1
      - name: Run DevDigest review
        run: node ${RUNNER_COMMIT_PATH} review --agent ${slug} --pr \${{ github.event.pull_request.number }} --fail-on ${manifest.ci_fail_on}
        env:
          ${secretKey}: \${{ secrets.${secretKey} }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;
}
