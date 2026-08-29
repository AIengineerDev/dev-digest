import { eq } from 'drizzle-orm';

import { digests } from '../../db/schema.js';
import type { Db } from '../../db/types.js';

export class DigestsRepository {
  constructor(private readonly db: Db) {}

  async listForRepo(repoId: string) {
    return this.db.select().from(digests).where(eq(digests.repoId, repoId));
  }

  async create(row: { repoId: string; window: string }) {
    const [created] = await this.db.insert(digests).values(row).returning();
    return created;
  }
}
