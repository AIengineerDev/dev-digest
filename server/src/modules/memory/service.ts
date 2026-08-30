import type { Container } from '../../platform/container.js';
import type { MemoryEntry } from '@devdigest/shared';
import { MemoryRepository } from './repository.js';

/**
 * Memory — what DevDigest has learned about a workspace's code: decisions,
 * conventions, preferences, facts, learnings, each with an embedding for
 * semantic recall into review prompts.
 *
 * Read-only, and empty in every deployment today: nothing writes this table
 * yet. The extraction that would fill it (observe a review, decide what is
 * worth remembering, embed it) is not built, so this service exists to make
 * the store visible rather than to pretend it is populated.
 */
export class MemoryService {
  private readonly repo: MemoryRepository;

  constructor(private readonly container: Container) {
    this.repo = new MemoryRepository(container.db);
  }

  async list(workspaceId: string): Promise<MemoryEntry[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      kind: r.kind,
      content: r.content,
      confidence: r.confidence,
      created_at: r.created_at.toISOString(),
      last_used_at: r.last_used_at ? r.last_used_at.toISOString() : null,
      repo: r.repo,
    }));
  }
}
