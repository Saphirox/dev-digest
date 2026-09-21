/**
 * SmartDiffViewer — the reviewer-ordered "Files changed" tab
 * (`docs/plans/0004-smart-diff.md`) plus the UI-fidelity gaps closed by
 * `docs/plans/0005-smart-diff-ui-fidelity.md`: an empty group renders
 * nothing (gap 1), a group header is one row with the right ICU plural
 * (gap 2), no summary chip/body row renders (removed) even though the
 * server computes it for every role (gap 6/7), and the stat line renders
 * `+N`/`−M` as separate elements (gap 8). `fetch` is never called — both
 * data hooks are mocked.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import smartDiff from "../../../../../../../../messages/en/smartDiff.json";
import shell from "../../../../../../../../messages/en/shell.json";

const usePrSmartDiff = vi.fn();
const usePrReviews = vi.fn();
vi.mock("@/lib/hooks", () => ({
  usePrSmartDiff: (prId: string | null) => usePrSmartDiff(prId),
  usePrReviews: (prId: string | null) => usePrReviews(prId),
}));

import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(cleanup);
beforeEach(() => {
  usePrSmartDiff.mockReset();
  usePrReviews.mockReset();
});

function renderViewer(files: PrFile[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ smartDiff, shell }}>
      <SmartDiffViewer prId="pr-1" files={files} />
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer — group rendering", () => {
  it("hides an empty boilerplate group entirely, shows the right ICU plural per group, renders no summary UI, and colours the stat line", () => {
    usePrSmartDiff.mockReturnValue({
      data: {
        groups: [
          {
            role: "core",
            files: [
              { path: "src/app.ts", pseudocode_summary: "exports handler", additions: 135, deletions: 16, finding_lines: [] },
            ],
          },
          {
            role: "wiring",
            files: [
              // One wiring file DOES carry a non-null summary from the server —
              // gap 7 says it must not render on a wiring card regardless.
              { path: "src/config.ts", pseudocode_summary: "exports CONFIG", additions: 0, deletions: 0, finding_lines: [] },
              { path: "src/routes.ts", pseudocode_summary: null, additions: 0, deletions: 0, finding_lines: [] },
              { path: "package.json", pseudocode_summary: null, additions: 0, deletions: 0, finding_lines: [] },
              { path: "tsconfig.json", pseudocode_summary: null, additions: 0, deletions: 0, finding_lines: [] },
              { path: "src/middleware/auth.ts", pseudocode_summary: null, additions: 0, deletions: 0, finding_lines: [] },
            ],
          },
          { role: "boilerplate", files: [] },
        ],
        split_suggestion: { total_lines: 151, too_big: false, proposed_splits: [] },
      },
      isLoading: false,
      isError: false,
    });
    usePrReviews.mockReturnValue({ data: [] });

    renderViewer();

    // gap 1 — the empty boilerplate group renders NO heading, blurb or "—".
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
    expect(screen.queryByText("Generated / mechanical — skim")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();

    // gap 2 — each visible group header is a single row: label + count together.
    const coreLabel = screen.getByText("Core logic");
    const coreCount = screen.getByText("1 file");
    expect(coreCount.parentElement).toBe(coreLabel.parentElement);
    const wiringLabel = screen.getByText("Wiring");
    const wiringCount = screen.getByText("5 files");
    expect(wiringCount.parentElement).toBe(wiringLabel.parentElement);

    // The summary chip and the "What this does:" row were removed: the server
    // still sends `pseudocode_summary` (both a core and a wiring file carry one
    // in this fixture), but the viewer must render neither, for any role.
    expect(screen.queryByText("summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/What this does/)).not.toBeInTheDocument();
    expect(screen.queryByText("exports handler")).not.toBeInTheDocument();
    expect(screen.queryByText("exports CONFIG")).not.toBeInTheDocument();

    // gap 8 — the stat line renders +N and −M as separately-coloured
    // elements (not one plain string) — the header total AND the file's own
    // row stat both do this, so scope with getAllByText.
    const [add] = screen.getAllByText("+135");
    const [del] = screen.getAllByText("−16");
    expect(add).toHaveStyle({ color: "var(--code-add-text)" });
    expect(del).toHaveStyle({ color: "var(--code-del-text)" });
  });
});

describe("SmartDiffViewer — findings badge", () => {
  const APP_TS_PATCH = `@@ -0,0 +1,25 @@\n${Array.from({ length: 25 }, (_, i) => `+line ${i + 1}`).join("\n")}`;

  const REVIEW_WITH_3_FINDINGS: ReviewRecord = {
    id: "review-1",
    pr_id: "pr-1",
    agent_id: "agent-1",
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00.000Z",
    findings: [1, 2, 3].map((n) => ({
      id: `f${n}`,
      severity: "CRITICAL",
      category: "bug",
      title: `finding ${n}`,
      file: "src/app.ts",
      start_line: n,
      end_line: n,
      rationale: "fixture",
      suggestion: null,
      confidence: 0.9,
      kind: "finding",
      review_id: "review-1",
      accepted_at: null,
      dismissed_at: null,
    })),
  };

  beforeEach(() => {
    // jsdom has no layout engine, so `scrollIntoView` isn't implemented —
    // stub it and capture which element it was called on.
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolledTo = this;
    });
  });

  let scrolledTo: Element | null = null;
  /** Read through a call so TS doesn't narrow `scrolledTo` to `null`:
   *  it is assigned inside the stubbed `scrollIntoView`, which control-flow
   *  analysis cannot see. */
  const lastScrolled = () => scrolledTo;

  it("reports the FINDINGS count (3), not the 22 flagged lines, and clicking it opens the card and scrolls to each flagged line in turn", () => {
    scrolledTo = null;
    usePrSmartDiff.mockReturnValue({
      data: {
        groups: [
          {
            role: "core",
            files: [
              {
                path: "src/app.ts",
                pseudocode_summary: null,
                additions: 25,
                deletions: 0,
                // 22 flagged lines server-side — deliberately more than the 3 findings.
                finding_lines: Array.from({ length: 22 }, (_, i) => i + 1),
              },
            ],
          },
          { role: "wiring", files: [] },
          { role: "boilerplate", files: [] },
        ],
        split_suggestion: { total_lines: 25, too_big: false, proposed_splits: [] },
      },
      isLoading: false,
      isError: false,
    });
    usePrReviews.mockReturnValue({ data: [REVIEW_WITH_3_FINDINGS] });

    renderViewer([{ path: "src/app.ts", additions: 25, deletions: 0, patch: APP_TS_PATCH }]);

    // One dot per PRESENT severity (criterion 27). The fixture's 3 findings
    // are all CRITICAL, so there is exactly one dot, and its accessible name
    // names the severity as well as the count.
    const badge = screen.getByRole("button", { name: /findings/ });
    expect(badge).toHaveAccessibleName("3 Critical findings"); // NOT "22 flagged lines"
    expect(screen.getAllByRole("button", { name: /finding/ })).toHaveLength(1);

    // Clicking a severity dot jumps to the FIRST finding of that severity and
    // stays there — it no longer round-robins through every flagged line.
    fireEvent.click(badge);
    expect(lastScrolled()?.id).toBe("smart-diff-src/app.ts-L1");

    fireEvent.click(badge);
    expect(lastScrolled()?.id).toBe("smart-diff-src/app.ts-L1");
  });

  it("shows one dot per severity, worst-first, each jumping to its own first finding", () => {
    const mixed: ReviewRecord = {
      ...REVIEW_WITH_3_FINDINGS,
      findings: [
        { ...REVIEW_WITH_3_FINDINGS.findings[0]!, id: "w1", severity: "WARNING", start_line: 7, end_line: 7 },
        { ...REVIEW_WITH_3_FINDINGS.findings[0]!, id: "c1", severity: "CRITICAL", start_line: 4, end_line: 4 },
        { ...REVIEW_WITH_3_FINDINGS.findings[0]!, id: "w2", severity: "WARNING", start_line: 9, end_line: 9 },
      ],
    };
    usePrSmartDiff.mockReturnValue({
      data: {
        groups: [
          {
            role: "core",
            files: [
              {
                path: "src/app.ts",
                pseudocode_summary: null,
                additions: 25,
                deletions: 0,
                finding_lines: [4, 7, 9],
              },
            ],
          },
          { role: "wiring", files: [] },
          { role: "boilerplate", files: [] },
        ],
        split_suggestion: { total_lines: 25, too_big: false, proposed_splits: [] },
      },
      isLoading: false,
      isError: false,
    });
    usePrReviews.mockReturnValue({ data: [mixed] });

    renderViewer([{ path: "src/app.ts", additions: 25, deletions: 0, patch: APP_TS_PATCH }]);

    const dots = screen.getAllByRole("button", { name: /finding/ });
    expect(dots).toHaveLength(2);
    // Worst severity first — SEVERITIES order, not insertion order.
    expect(dots[0]).toHaveAccessibleName("1 Critical finding");
    expect(dots[1]).toHaveAccessibleName("2 Warning findings");

    fireEvent.click(dots[1]!);
    expect(lastScrolled()?.id).toBe("smart-diff-src/app.ts-L7"); // first WARNING, not line 4

    fireEvent.click(dots[0]!);
    expect(lastScrolled()?.id).toBe("smart-diff-src/app.ts-L4"); // first CRITICAL
  });
});
