import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { toBlastRadius } from './helpers.js';
import { BlastRepository } from './repository.js';

/**
 * Blast radius for a pull request — which symbols it changes, who calls them,
 * and which endpoints and crons sit downstream.
 *
 * Two reads, one facade call, one pure mapping. It earns a service because it
 * composes a repository with an adapter (`container.repoIntel`) and applies a
 * grouping rule that is not shape validation.
 *
 * **No model call.** The whole point of the feature is that the answer comes
 * from the persistent code index — `repo-intel` walks the import graph and
 * falls back to ripgrep. A PR the index cannot speak to gets an honest empty
 * answer with `degraded` folded into the summary, never a guess.
 */
export class BlastService {
  private readonly repo: BlastRepository;

  constructor(private readonly container: Container) {
    this.repo = new BlastRepository(container.db);
  }

  async forPull(workspaceId: string, prId: string): Promise<BlastRadius> {
    const pr = await this.repo.findPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');

    const files = await this.repo.changedFiles(pr.id);
    if (files.length === 0) {
      // Not an error: `GET /pulls/:id` is what imports the file list, so a PR
      // nobody has opened yet legitimately has none. Say which state this is.
      return toBlastRadius(
        { changedSymbols: [], callers: [], impactedEndpoints: [] },
        { noFiles: true },
      );
    }

    const result = await this.container.repoIntel.getBlastRadius(pr.repoId, files);
    return toBlastRadius(result);
  }
}
