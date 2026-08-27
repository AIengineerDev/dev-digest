import * as t from '../../db/schema.js';
import type { PreviewResponse } from '@devdigest/shared';

type BlobRow = typeof t.codeBlobs.$inferSelect;
type FindingRow = typeof t.findings.$inferSelect;

const MAX_PREVIEW_LINES = 400;

export function toPreview(blob: BlobRow, findings: FindingRow[]): PreviewResponse {
  const lines = blob.content.split('\n').slice(0, MAX_PREVIEW_LINES);
  return {
    path: blob.path,
    language: blob.language,
    truncated: blob.content.split('\n').length > MAX_PREVIEW_LINES,
    lines,
    markers: findings.map((f) => ({
      line: f.startLine,
      severity: f.severity,
      title: f.title,
    })),
  };
}
