import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import * as t from '../../db/schema.js';

export class PreviewRepository {
  constructor(private readonly db: Db) {}

  async getIndexedBlob(workspaceId: string, repoId: string, path: string) {
    const [row] = await this.db
      .select()
      .from(t.codeBlobs)
      .where(
        and(
          eq(t.codeBlobs.workspaceId, workspaceId),
          eq(t.codeBlobs.repoId, repoId),
          eq(t.codeBlobs.path, path),
        ),
      );
    return row;
  }

  async findingsForPath(repoId: string, path: string) {
    return this.db
      .select()
      .from(t.findings)
      .where(and(eq(t.findings.repoId, repoId), eq(t.findings.file, path)));
  }
}
