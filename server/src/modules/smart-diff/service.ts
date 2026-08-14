import type { SmartDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff, normalizePath } from './helpers.js';
import { SmartDiffRepository } from './repository.js';

/**
 * Smart Diff — risk-ordered view of a PR's changed files.
 *
 * Two reads and one pure fold. It earns a service (not a route straight onto a
 * repository) because it composes two independent reads and applies a rule that
 * is not shape validation; it deliberately owns no transaction, because it
 * writes nothing.
 *
 * **No model call happens here, ever.** If this file grows an
 * `container.llm(...)`, the feature's contract with the user is broken: opening
 * a diff must be free.
 */
export class SmartDiffService {
  private readonly repo: SmartDiffRepository;

  constructor(container: Container) {
    this.repo = new SmartDiffRepository(container.db);
  }

  async forPull(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pr = await this.repo.findPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');

    const [files, findings] = await Promise.all([
      this.repo.filesForPull(pr.id),
      this.repo.findingsAtHead(pr.id, pr.headSha),
    ]);

    // Findings name a file by the path the model saw, which is the same path
    // GitHub reports — but normalise both sides anyway, so a stray `./` on
    // either one cannot silently drop every badge on that file.
    const byPath = new Map<string, number[]>();
    for (const f of findings) {
      const key = normalizePath(f.file);
      (byPath.get(key) ?? byPath.set(key, []).get(key)!).push(f.startLine);
    }

    return buildSmartDiff(files, byPath);
  }
}
