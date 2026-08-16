import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

/** The endpoint is stubbed at the hook — the point of this suite is the join
 *  and the interaction, and the route itself is pinned server-side. */
const smartDiffQuery = vi.hoisted(() => ({
  current: { data: undefined as SmartDiff | undefined, isLoading: false, isError: false },
}));
vi.mock("@/lib/hooks", () => ({
  useSmartDiff: () => ({ ...smartDiffQuery.current, error: null, refetch: vi.fn() }),
}));

import { SmartDiffViewer } from "./SmartDiffViewer";
import { buildAnnotations, defaultOpenPredicate, findingsAtHead, withPatches } from "./helpers";

afterEach(cleanup);

const patch = (from: number, lines: string[]) =>
  [`@@ -${from},${lines.length} +${from},${lines.length} @@`, ...lines.map((l) => `+${l}`)].join("\n");

const PR_FILES: PrFile[] = [
  {
    path: "src/api/public/webhooks.ts",
    additions: 3,
    deletions: 0,
    patch: patch(61, ["const target = req.body.callback_url;", "const token = account.apiToken;", "await fetch(target);"]),
  },
  { path: "src/middleware/ratelimit.ts", additions: 2, deletions: 0, patch: patch(26, ["const key = bucketKey(req);", "const count = await redis.incr(key);"]) },
  { path: "package-lock.json", additions: 92, deletions: 24, patch: patch(1, ["\"lockfileVersion\": 3,"]) },
];

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/api/public/webhooks.ts", pseudocode_summary: null, additions: 3, deletions: 0, finding_lines: [61, 63] },
        { path: "src/middleware/ratelimit.ts", pseudocode_summary: null, additions: 2, deletions: 0, finding_lines: [] },
      ],
    },
    { role: "wiring", files: [] },
    {
      role: "boilerplate",
      files: [
        { path: "package-lock.json", pseudocode_summary: null, additions: 92, deletions: 24, finding_lines: [] },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 5, proposed_splits: [] },
};

const HEAD = "abc";

const REVIEWS: ReviewRecord[] = [
  {
    id: "rv2",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: "Security",
    head_sha: "abc",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 30,
    model: null,
    grounding: null,
    created_at: "2026-06-02T10:00:00Z",
    findings: [
      {
        id: "f1", severity: "CRITICAL", category: "security", title: "SSRF via caller-supplied callback_url",
        file: "src/api/public/webhooks.ts", start_line: 61, end_line: 61,
        rationale: "", suggestion: null, confidence: 0.9, kind: "finding",
        trifecta_components: null, evidence: null, review_id: "rv2", accepted_at: null, dismissed_at: null,
      },
      {
        id: "f2", severity: "WARNING", category: "security", title: "Account token forwarded to an arbitrary host",
        file: "src/api/public/webhooks.ts", start_line: 63, end_line: 63,
        rationale: "", suggestion: null, confidence: 0.8, kind: "finding",
        trifecta_components: null, evidence: null, review_id: "rv2", accepted_at: null, dismissed_at: null,
      },
    ],
  },
  {
    id: "rv1",
    pr_id: "pr1",
    // An OLDER head: rv1 reviewed code that has since been pushed over.
    agent_id: null, run_id: null, agent_name: "Security", head_sha: "old-head",
    kind: "review", verdict: "comment", summary: null, score: 80, model: null, grounding: null,
    created_at: "2026-06-01T10:00:00Z",
    findings: [
      {
        id: "old", severity: "SUGGESTION", category: "style", title: "Stale finding from the first run",
        file: "src/middleware/ratelimit.ts", start_line: 26, end_line: 26,
        rationale: "", suggestion: null, confidence: 0.5, kind: "finding",
        trifecta_components: null, evidence: null, review_id: "rv1", accepted_at: null, dismissed_at: null,
      },
    ],
  },
];

function renderViewer(
  reviews: ReviewRecord[] | undefined,
  onOpenFinding?: (findingId: string) => void,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <div data-theme="dark">
        <SmartDiffViewer
          prId="pr1"
          files={PR_FILES}
          reviews={reviews}
          headSha={HEAD}
          onOpenFinding={onOpenFinding}
        />
      </div>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  smartDiffQuery.current = { data: SMART_DIFF, isLoading: false, isError: false };
  // jsdom has no layout, so scrollIntoView is not implemented on elements.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

describe("SmartDiffViewer", () => {
  it("renders core before boilerplate and skips an empty group", () => {
    renderViewer(REVIEWS);
    const headings = screen.getAllByText(/Core logic|Wiring|Boilerplate/);
    expect(headings.map((h) => h.textContent)).toEqual(["Core logic", "Boilerplate"]);
  });

  it("leaves the lock file collapsed and shows core code by default", () => {
    renderViewer(REVIEWS);
    expect(screen.getByText("const key = bucketKey(req);")).toBeInTheDocument();
    // The lock file's header is there; its content is not.
    expect(screen.getByText("package-lock.json")).toBeInTheDocument();
    expect(screen.queryByText('"lockfileVersion": 3,')).not.toBeInTheDocument();
  });

  it("expands the lock file when the reviewer asks for it", () => {
    renderViewer(REVIEWS);
    fireEvent.click(screen.getByText("package-lock.json"));
    expect(screen.getByText('"lockfileVersion": 3,')).toBeInTheDocument();
  });

  it("shows no findings badge before a review has run", () => {
    // The unreviewed state is BOTH sides empty: the API reports no
    // finding_lines and the page has no reviews to describe them with.
    smartDiffQuery.current = {
      data: {
        ...SMART_DIFF,
        groups: SMART_DIFF.groups.map((g) => ({
          ...g,
          files: g.files.map((f) => ({ ...f, finding_lines: [] })),
        })),
      },
      isLoading: false,
      isError: false,
    };
    renderViewer(undefined);
    expect(screen.queryByRole("button", { name: /findings/ })).not.toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
  });

  it("badges a file with the count the API reported and scrolls to the first line", () => {
    renderViewer(REVIEWS);
    const badge = screen.getByRole("button", { name: "2 findings" });
    fireEvent.click(badge);

    const line = document.getElementById("diff-line-src/api/public/webhooks.ts-L61");
    expect(line).not.toBeNull();
    expect(line!.scrollIntoView).toHaveBeenCalled();
  });

  it("a badge opens the finding's card instead of scrolling, when it can", () => {
    // The badge is a way INTO the finding: with somewhere to go it navigates,
    // and the diff is not scrolled at all.
    const onOpenFinding = vi.fn();
    renderViewer(REVIEWS, onOpenFinding);
    fireEvent.click(screen.getByRole("button", { name: "2 findings" }));

    expect(onOpenFinding).toHaveBeenCalledWith("f1");
    const line = document.getElementById("diff-line-src/api/public/webhooks.ts-L61");
    expect(line!.scrollIntoView).not.toHaveBeenCalled();
  });

  it("a line's severity chip opens that line's finding, not the file's first", () => {
    const onOpenFinding = vi.fn();
    renderViewer(REVIEWS, onOpenFinding);
    fireEvent.click(screen.getByRole("button", { name: "warning" }));
    expect(onOpenFinding).toHaveBeenCalledWith("f2");
  });

  it("falls back to scrolling for a flagged line no loaded review explains", () => {
    // The API says the line is flagged and the badge must still appear — but
    // there is no card to open, so the click stays inside the diff.
    const onOpenFinding = vi.fn();
    renderViewer(undefined, onOpenFinding);
    fireEvent.click(screen.getByRole("button", { name: "2 findings" }));

    expect(onOpenFinding).not.toHaveBeenCalled();
    expect(
      document.getElementById("diff-line-src/api/public/webhooks.ts-L61")!.scrollIntoView,
    ).toHaveBeenCalled();
  });

  it("renders a severity chip per flagged line, worst severity per line", () => {
    renderViewer(REVIEWS);
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  it("says so when every finding it has comes from an older head", () => {
    // The diff carries no markers, which is correct — and reads as "clean" if
    // nothing explains it. This is the case the user hits after pushing.
    smartDiffQuery.current = {
      data: {
        ...SMART_DIFF,
        groups: SMART_DIFF.groups.map((g) => ({
          ...g,
          files: g.files.map((f) => ({ ...f, finding_lines: [] })),
        })),
      },
      isLoading: false,
      isError: false,
    };
    const onOpenFinding = vi.fn();
    renderViewer(REVIEWS, onOpenFinding);

    expect(screen.getByText(/not shown here/)).toBeInTheDocument();
    expect(screen.getByText(/older commit \(old-hea\)/)).toBeInTheDocument();
  });

  it("shows the stale findings on the diff when asked, and takes them back", () => {
    // Anchored to the OLD head's line numbers, so they are off by default and
    // drawn as a dashed hint rather than as a claim about this line.
    smartDiffQuery.current = {
      data: {
        ...SMART_DIFF,
        groups: SMART_DIFF.groups.map((g) => ({
          ...g,
          files: g.files.map((f) => ({ ...f, finding_lines: [] })),
        })),
      },
      isLoading: false,
      isError: false,
    };
    const onOpenFinding = vi.fn();
    renderViewer(REVIEWS, onOpenFinding);
    expect(screen.queryByRole("button", { name: /finding/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show them anyway" }));
    const badge = screen.getByRole("button", { name: "1 finding" });
    expect(badge).toBeInTheDocument();
    // Still a way into the card it names.
    fireEvent.click(badge);
    expect(onOpenFinding).toHaveBeenCalledWith("old");

    fireEvent.click(screen.getByRole("button", { name: "Hide them" }));
    expect(screen.queryByRole("button", { name: /finding/ })).not.toBeInTheDocument();
  });

  it("stays quiet when the current head has findings of its own", () => {
    renderViewer(REVIEWS);
    expect(screen.queryByText(/not shown here/)).not.toBeInTheDocument();
  });

  it("ignores findings from a review of an older head", () => {
    renderViewer(REVIEWS);
    // rv1 flagged ratelimit.ts:26 but ran against a head that has been pushed over.
    const card = screen.getByText("src/middleware/ratelimit.ts").closest("div")!;
    expect(within(card).queryByRole("button", { name: /findings/ })).not.toBeInTheDocument();
  });

  it("renders a split banner only when the API says the PR is too big", () => {
    smartDiffQuery.current = {
      data: {
        ...SMART_DIFF,
        split_suggestion: {
          too_big: true,
          total_lines: 620,
          proposed_splits: [
            { name: "src/api", files: ["src/api/public/webhooks.ts", "src/api/public/index.ts"] },
            { name: "src/middleware", files: ["src/middleware/ratelimit.ts", "src/middleware/auth.ts"] },
          ],
        },
      },
      isLoading: false,
      isError: false,
    };
    renderViewer(REVIEWS);
    expect(screen.getByText("This PR is large (620 changed lines)")).toBeInTheDocument();
    expect(screen.getByText(/src\/middleware · 2 files/)).toBeInTheDocument();
  });

  it("renders a loading state and an error state", () => {
    smartDiffQuery.current = { data: undefined, isLoading: true, isError: false };
    const { unmount } = renderViewer(REVIEWS);
    unmount();

    smartDiffQuery.current = { data: undefined, isLoading: false, isError: true };
    renderViewer(REVIEWS);
    expect(screen.getByText("Couldn't order this diff")).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("findingsAtHead keeps every review of the current head and drops older ones", () => {
    // Order-independent: one 'run all agents' writes one review per agent, so
    // the newest row alone would be one agent's opinion.
    const reversed = [...REVIEWS].reverse();
    expect(findingsAtHead(reversed, HEAD).map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(findingsAtHead(REVIEWS, "some-newer-head").map((f) => f.id)).toEqual([]);
    expect(findingsAtHead(undefined, HEAD)).toEqual([]);
  });

  it("findingsAtHead treats an unrecorded head as current, never as stale", () => {
    // Rows written before reviews.head_sha existed carry null; calling them
    // stale would blank the badges on every historical review.
    const legacy = [{ ...REVIEWS[0]!, head_sha: null }];
    expect(findingsAtHead(legacy, HEAD).map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(findingsAtHead(REVIEWS, null).map((f) => f.id)).toEqual(["f1", "f2", "old"]);
  });

  it("buildAnnotations produces exactly one mark per server-reported line", () => {
    const marks = buildAnnotations(SMART_DIFF.groups, findingsAtHead(REVIEWS, HEAD));
    expect(marks.get("src/api/public/webhooks.ts")).toEqual([
      { id: "f1", findingId: "f1", line: 61, severity: "CRITICAL", title: "SSRF via caller-supplied callback_url" },
      { id: "f2", findingId: "f2", line: 63, severity: "WARNING", title: "Account token forwarded to an arbitrary host" },
    ]);
    expect(marks.has("src/middleware/ratelimit.ts")).toBe(false);
  });

  it("buildAnnotations still marks a line it cannot match to a finding", () => {
    // The server is the source of truth for WHICH lines are flagged; dropping
    // an unmatched one would render a flagged file as clean.
    const marks = buildAnnotations(SMART_DIFF.groups, []);
    expect(marks.get("src/api/public/webhooks.ts")).toHaveLength(2);
    expect(marks.get("src/api/public/webhooks.ts")![0]!.severity).toBe("WARNING");
    // …and it carries no card id, which is what makes the badge fall back to
    // scrolling instead of navigating to a card that does not exist.
    expect(marks.get("src/api/public/webhooks.ts")![0]!.findingId).toBeNull();
  });

  it("defaultOpenPredicate never opens boilerplate but always opens a flagged file", () => {
    const [core, , boilerplate] = SMART_DIFF.groups;
    const openCore = defaultOpenPredicate(core!);
    const openBoiler = defaultOpenPredicate(boilerplate!);
    expect(openCore(PR_FILES[0]!)).toBe(true); // has findings
    expect(openCore(PR_FILES[1]!)).toBe(true); // small core file
    expect(openBoiler(PR_FILES[2]!)).toBe(false);

    const flaggedLock = defaultOpenPredicate({
      role: "boilerplate",
      files: [{ ...boilerplate!.files[0]!, finding_lines: [4] }],
    });
    expect(flaggedLock(PR_FILES[2]!)).toBe(true);
  });

  it("withPatches keeps the classified order and drops a file with no patch", () => {
    const ordered = withPatches(
      [
        { path: "src/middleware/ratelimit.ts", pseudocode_summary: null, additions: 2, deletions: 0, finding_lines: [] },
        { path: "src/gone.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
        { path: "src/api/public/webhooks.ts", pseudocode_summary: null, additions: 3, deletions: 0, finding_lines: [] },
      ],
      PR_FILES,
    );
    expect(ordered.map((f) => f.path)).toEqual([
      "src/middleware/ratelimit.ts",
      "src/api/public/webhooks.ts",
    ]);
  });
});
