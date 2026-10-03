/**
 * PrBriefBlock — the Overview tab's PR Brief block. Hooks are mocked at the
 * "@/lib/hooks" specifier (the one this component imports); the generate
 * mutation is a plain fake so pending/error states are driven directly.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, PrFile, ReviewRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const usePrBrief = vi.fn();
const usePrBlast = vi.fn();
const generateMutate = vi.fn();
const useGenerateBrief = vi.fn();

vi.mock("@/lib/hooks", () => ({
  usePrBrief: (prId: string | null) => usePrBrief(prId),
  usePrBlast: (prId: string | null) => usePrBlast(prId),
  useGenerateBrief: (prId: string | null) => useGenerateBrief(prId),
}));

import { PrBriefBlock } from "./PrBriefBlock";

const onOpenFile = vi.fn();

const FILES = [
  { path: "src/config.ts", additions: 4, deletions: 0 },
  { path: "docs/notes.md", additions: 1, deletions: 0 },
] as PrFile[];

function brief(o: Partial<PrBrief> = {}): PrBrief {
  return {
    summary: "Adds a rate limiter and commits a live key.",
    risks: [
      {
        kind: "secrets",
        title: "Live Stripe key committed",
        explanation: "sk_live in config",
        severity: "high",
        file_refs: [
          { file: "src/config.ts", start_line: 12 },
          { file: "src/server.ts", start_line: 88, end_line: 90 },
        ],
      },
      { kind: "perf", title: "Extra round trip", explanation: "x", severity: "low", file_refs: [{ file: "src/config.ts" }] },
    ],
    review_focus: [
      { file: "src/config.ts", line: 12, reason: "live key committed" },
      { file: "src/server.ts", line: 88, reason: "bootstrap wiring" },
      { file: "docs/notes.md", line: 3, reason: "docs claim" },
    ],
    file_summaries: [],
    generated_for_sha: "head111",
    generated_at: "2026-10-02T00:00:00.000Z",
    missing_inputs: [],
    cost_usd: 0.014,
    tokens_in: 8200,
    tokens_out: 1300,
    ...o,
  };
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security",
    kind: "review",
    verdict: "request_changes",
    summary: "review summary that must not replace the brief summary",
    score: 61,
    model: "m",
    created_at: "2026-10-02T00:00:00.000Z",
    findings: [
      { id: "f1", severity: "CRITICAL", dismissed_at: null },
      { id: "f2", severity: "CRITICAL", dismissed_at: "2026-10-02T01:00:00.000Z" },
      { id: "f3", severity: "WARNING", dismissed_at: null },
    ],
    ...o,
  } as unknown as ReviewRecord;
}

function renderBlock(
  props: Partial<React.ComponentProps<typeof PrBriefBlock>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      <PrBriefBlock
        prId="pr-1"
        headSha="head111"
        prFiles={FILES}
        reviews={[]}
        repoFullName="acme/payments-api"
        onOpenFile={onOpenFile}
        {...props}
      >
        <div data-testid="grid">intent and blast</div>
      </PrBriefBlock>
    </NextIntlClientProvider>,
  );
}

function setGenerate(o: { isPending?: boolean; isError?: boolean; error?: unknown } = {}) {
  useGenerateBrief.mockReturnValue({ mutate: generateMutate, isPending: false, isError: false, error: null, ...o });
}

afterEach(cleanup);
beforeEach(() => {
  usePrBrief.mockReset();
  usePrBlast.mockReset();
  generateMutate.mockReset();
  onOpenFile.mockReset();
  usePrBrief.mockReturnValue({ data: brief(), isLoading: false });
  usePrBlast.mockReturnValue({ data: { indexed_sha: "idx999" } });
  setGenerate();
});

describe("PrBriefBlock", () => {
  it('labels a ref to line 1 of a file the PR adds as "new file", not ":1"; a modified file keeps its line', () => {
    usePrBrief.mockReturnValue({
      data: brief({
        risks: [],
        review_focus: [
          { file: "src/config.ts", line: 1, reason: "whole new file" },
          { file: "docs/notes.md", line: 1, reason: "edited at the top" },
        ],
      }),
      isLoading: false,
    });
    renderBlock({
      prFiles: [
        { path: "src/config.ts", additions: 4, deletions: 0, patch: "@@ -0,0 +1,4 @@\n+a" },
        { path: "docs/notes.md", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" },
      ] as PrFile[],
    });

    expect(screen.getByRole("button", { name: "src/config.ts" })).toBeInTheDocument();
    expect(screen.getByText("new file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs/notes.md:1" })).toBeInTheDocument();
  });

  it("hands Risk areas to a render-prop child (inside the Intent block), before Review focus", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
        <PrBriefBlock prId="pr-1" headSha="head111" prFiles={FILES} reviews={[]} repoFullName="acme/payments-api" onOpenFile={onOpenFile}>
          {({ risks }) => <div data-testid="intent">{risks}</div>}
        </PrBriefBlock>
      </NextIntlClientProvider>,
    );

    const intent = screen.getByTestId("intent");
    expect(within(intent).getByText("Risk areas")).toBeInTheDocument();
    expect(within(intent).getByText("Live Stripe key committed")).toBeInTheDocument();
    expect(screen.getAllByText("Risk areas")).toHaveLength(1);
    expect(
      intent.compareDocumentPosition(screen.getByText("Review focus — read these first")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("passes no Risk areas to the render-prop child before a brief exists", () => {
    usePrBrief.mockReturnValue({ data: null, isLoading: false });
    render(
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
        <PrBriefBlock prId="pr-1" headSha="head111" prFiles={FILES} reviews={[]} repoFullName="acme/payments-api" onOpenFile={onOpenFile}>
          {({ risks }) => <div data-testid="intent">{risks}</div>}
        </PrBriefBlock>
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("intent")).toBeEmptyDOMElement();
  });

  it("AC-1/AC-11/AC-19: lays out label, banner, the children, risks, focus in order", () => {
    renderBlock();

    const nodes = [
      screen.getByText("PR Brief"),
      screen.getByText("Adds a rate limiter and commits a live key."),
      screen.getByTestId("grid"),
      screen.getByText("Risk areas"),
      screen.getByText("Review focus — read these first"),
    ];
    for (let i = 0; i < nodes.length - 1; i++) {
      expect(nodes[i]!.compareDocumentPosition(nodes[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("AC-2/EC-7: with no brief it offers Generate, hides risks and focus, and shows a failure under the button", () => {
    usePrBrief.mockReturnValue({ data: null, isLoading: false });
    renderBlock();

    expect(screen.getByTestId("grid")).toBeInTheDocument();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    expect(screen.queryByText("Review focus — read these first")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);

    cleanup();
    setGenerate({ isError: true, error: new Error("OPENAI_API_KEY is not configured") });
    renderBlock();
    expect(screen.getByRole("alert")).toHaveTextContent("OPENAI_API_KEY is not configured");
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
  });

  it("does not flash the Generate button while the brief is loading", () => {
    usePrBrief.mockReturnValue({ data: undefined, isLoading: true });
    renderBlock();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
  });

  it("AC-22/AC-23/EC-6: refresh regenerates, disables while pending, keeps the stored brief on failure", () => {
    renderBlock();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate brief" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);

    cleanup();
    setGenerate({ isPending: true });
    renderBlock();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Generating…");

    cleanup();
    usePrBrief.mockReturnValue({ data: null, isLoading: false });
    renderBlock();
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();

    cleanup();
    usePrBrief.mockReturnValue({ data: brief(), isLoading: false });
    setGenerate({ isError: true, error: new Error("provider timeout") });
    renderBlock();
    expect(screen.getByText("Adds a rate limiter and commits a live key.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("provider timeout");
  });

  it("AC-24: shows the stale badge only when the head moved", () => {
    renderBlock();
    expect(screen.queryByText("Stale — regenerate")).not.toBeInTheDocument();

    cleanup();
    renderBlock({ headSha: "head222" });
    expect(screen.getByText("Stale — regenerate")).toBeInTheDocument();
  });

  it("AC-12/AC-13: reuses the verdict banner for the latest completed review, else a plain summary", () => {
    renderBlock({ reviews: [review()] });
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/3 findings/)).toBeInTheDocument();
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    // The brief summary, not the review's, is the banner text.
    expect(screen.getByText("Adds a rate limiter and commits a live key.")).toBeInTheDocument();
    expect(screen.queryByText(/review summary that must not/)).not.toBeInTheDocument();

    cleanup();
    renderBlock({ reviews: [] });
    expect(screen.getByText("Adds a rate limiter and commits a live key.")).toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
  });

  it("AC-14: renders cost and in→out tokens, omitting an unknown side and showing an unknown cost as an em dash", () => {
    renderBlock();
    expect(screen.getByText("8.2K→1.3K")).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0140/)).toBeInTheDocument();

    cleanup();
    usePrBrief.mockReturnValue({ data: brief({ tokens_out: null }), isLoading: false });
    renderBlock();
    expect(screen.getByText("8.2K in")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();

    cleanup();
    usePrBrief.mockReturnValue({ data: brief({ tokens_in: null }), isLoading: false });
    renderBlock();
    expect(screen.getByText("1.3K out")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();

    cleanup();
    usePrBrief.mockReturnValue({ data: brief({ cost_usd: null, tokens_in: null, tokens_out: null }), isLoading: false });
    renderBlock();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/→|\bin\b|\bout\b/)).not.toBeInTheDocument();
  });

  it("AC-15/NFR-7: risks list titles, severity text names and refs as path, path:line, path:a-b", () => {
    renderBlock();
    expect(screen.getByText("Live Stripe key committed")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "High risk" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Low risk" })).toBeInTheDocument();

    const risks = screen.getByText("Risk areas").closest("section") as HTMLElement;
    expect(within(risks).getByRole("button", { name: "src/config.ts:12" })).toBeInTheDocument();
    expect(within(risks).getByRole("button", { name: "src/config.ts" })).toBeInTheDocument();
    expect(within(risks).getByRole("link", { name: "src/server.ts:88-90" })).toBeInTheDocument();
  });

  it("AC-16/AC-17/AC-27/NFR-8: focus items keep API order and PR-file refs are real buttons that open the file", () => {
    renderBlock();
    const focus = screen.getByText("Review focus — read these first").closest("section") as HTMLElement;
    expect(within(focus).getByText("3")).toBeInTheDocument(); // count beside the heading
    const items = within(focus).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "▸src/config.ts:12 — live key committed",
      "▸src/server.ts:88 — bootstrap wiring",
      "▸docs/notes.md:3 — docs claim",
    ]);

    const docsRef = within(focus).getByRole("button", { name: "docs/notes.md:3" });
    expect(docsRef.tagName).toBe("BUTTON");
    expect(docsRef).toHaveAttribute("type", "button");
    fireEvent.click(docsRef);
    expect(onOpenFile).toHaveBeenCalledWith("docs/notes.md");

    // A risk's PR-file ref behaves the same way (AC-27).
    const risks = screen.getByText("Risk areas").closest("section") as HTMLElement;
    fireEvent.click(within(risks).getByRole("button", { name: "src/config.ts:12" }));
    expect(onOpenFile).toHaveBeenLastCalledWith("src/config.ts");
  });

  it("AC-18/AC-28: a blast-only file is a GitHub blob link in a new tab, at the indexed sha else the head sha", () => {
    renderBlock();
    const focus = screen.getByText("Review focus — read these first").closest("section") as HTMLElement;
    const link = within(focus).getByRole("link", { name: "src/server.ts:88" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/idx999/src/server.ts#L88");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(onOpenFile).not.toHaveBeenCalled();

    cleanup();
    usePrBlast.mockReturnValue({ data: { indexed_sha: null } });
    renderBlock();
    const risks = screen.getByText("Risk areas").closest("section") as HTMLElement;
    expect(within(risks).getByRole("link", { name: "src/server.ts:88-90" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/head111/src/server.ts#L88-L90",
    );

    // Unknown repo: plain text, never a dead control.
    cleanup();
    renderBlock({ repoFullName: null });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "src/server.ts:88" })).not.toBeInTheDocument();
    expect(screen.getAllByText("src/server.ts:88").length).toBeGreaterThan(0);
  });

  it("EC-2/EC-3/AC-21: empty lists show their text, and missing inputs are named", () => {
    usePrBrief.mockReturnValue({
      data: brief({ risks: [], review_focus: [], missing_inputs: ["intent", "blast radius (no_data)", "issue #77"] }),
      isLoading: false,
    });
    renderBlock();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("Nothing to read first — no file stands out.")).toBeInTheDocument();
    expect(screen.getByText(/intent, blast radius \(no_data\), issue #77/)).toBeInTheDocument();
  });

  it("NFR-3: model text renders as text, never as markup", () => {
    const evil = "<script>window.__pwned = 1</script><img src=x onerror=alert(1)>";
    usePrBrief.mockReturnValue({
      data: brief({
        summary: evil,
        review_focus: [{ file: "src/config.ts", line: 1, reason: evil }],
        risks: [{ kind: "k", title: evil, explanation: evil, severity: "low", file_refs: [{ file: "src/config.ts" }] }],
      }),
      isLoading: false,
    });
    const { container } = renderBlock();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(evil, { exact: false }).length).toBeGreaterThanOrEqual(3);
  });
});
