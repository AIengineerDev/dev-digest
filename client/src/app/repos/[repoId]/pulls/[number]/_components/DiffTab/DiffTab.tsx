"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { SmartDiffViewer } from "../SmartDiffViewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile, ReviewRecord } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** The PR's reviews — Smart Diff badges the diff with the current head's. */
  reviews: ReviewRecord[] | undefined;
  /** The PR's current head, so stale reviews do not badge the diff. */
  headSha: string | null;
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, reviews, headSha, canComment }: DiffTabProps) {
  const t = useTranslations("prReview.smartDiff");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  // Smart order is the default: the whole point is that a reviewer who opens
  // the tab and reads top-down reads the risky files first.
  const [smartOrder, setSmartOrder] = React.useState(true);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Button
              kind={smartOrder ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSmartOrder(true)}
            >
              {t("smartOrder")}
            </Button>
            <Button
              kind={smartOrder ? "ghost" : "secondary"}
              size="sm"
              onClick={() => setSmartOrder(false)}
            >
              {t("originalOrder")}
            </Button>
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </span>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {smartOrder ? (
        <SmartDiffViewer
          prId={prId}
          files={files}
          reviews={reviews}
          headSha={headSha}
          commenting={commenting}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
