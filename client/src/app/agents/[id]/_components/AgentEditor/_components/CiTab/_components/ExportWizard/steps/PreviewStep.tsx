/* Step 2 — Preview. Renders the `CiFile[]` generated once when leaving
   Target (R3) — read-only, never sent back (Q3). Generation failure keeps the
   wizard here with a Retry and writes no row. */
"use client";

import type { CiFile } from "@devdigest/shared";
import { Badge, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { s } from "../styles";
import type { TFunc } from "../types";

export function PreviewStep({
  t,
  files,
  generating,
  error,
  onRetry,
  selectedPath,
  onSelectPath,
}: {
  t: TFunc;
  files: CiFile[] | null;
  generating: boolean;
  error: string | null;
  onRetry: () => void;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
}) {
  if (generating) {
    return (
      <div style={s.previewCenter}>
        <Skeleton />
      </div>
    );
  }
  if (error) {
    return <ErrorState title={t("genFailedTitle")} body={error} onRetry={onRetry} />;
  }
  if (!files || files.length === 0) {
    return null;
  }
  // `files.length === 0` already returned above, so the fallback index exists.
  const selected = files.find((f) => f.path === selectedPath) ?? files[files.length - 1]!;

  return (
    <div style={s.previewGrid}>
      <div style={s.previewFilesPane}>
        <div style={s.previewFilesLabel}>{t("filesToCreate")}</div>
        {files.map((f) => {
          const active = f.path === selected.path;
          return (
            <button
              key={f.path}
              type="button"
              onClick={() => onSelectPath(f.path)}
              style={{ ...s.previewFileRow(active), border: "none", width: "100%", textAlign: "left" }}
            >
              <Icon.FileText size={13} style={{ flexShrink: 0 }} />
              <span className="mono">{f.path}</span>
            </button>
          );
        })}
      </div>
      <div style={s.previewContentPane}>
        <div style={s.previewContentHeader}>
          <span className="mono" style={s.previewContentPath}>
            {selected.path}
          </span>
          <Badge color="var(--text-muted)" icon="Lock">
            {t("readOnly")}
          </Badge>
        </div>
        <pre className="mono" style={s.previewPre}>
          {selected.contents}
        </pre>
      </div>
    </div>
  );
}
