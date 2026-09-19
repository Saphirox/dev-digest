/**
 * FindingsCell — the PR list's FINDINGS column. Guards the lazy fetch (no
 * request for a PR nobody hovers) and that the card lists only open findings,
 * worst first.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/prReview.json";

const usePrReviews = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: (id: string | null) => usePrReviews(id) }));

import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);
beforeEach(() => {
  usePrReviews.mockReset();
  usePrReviews.mockReturnValue({ data: undefined });
});

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "perf",
    title: `Finding ${o.id}`,
    file: "src/a.ts",
    start_line: 1,
    end_line: 2,
    rationale: "Because.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function renderCell(counts = { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 }) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsCell prId="pr-1" counts={counts} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsCell", () => {
  it("renders the per-severity chips without fetching anything", () => {
    renderCell();
    expect(screen.getByLabelText("1 Critical")).toBeInTheDocument();
    expect(screen.getByLabelText("1 Warning")).toBeInTheDocument();
    expect(usePrReviews).toHaveBeenCalled();
    expect(usePrReviews.mock.calls.every(([id]) => id === null)).toBe(true);
  });

  it("starts fetching the PR's reviews on first hover", () => {
    renderCell();
    fireEvent.mouseEnter(screen.getByLabelText("1 Critical").parentElement!);
    expect(usePrReviews).toHaveBeenLastCalledWith("pr-1");
  });

  it("previews only open findings, worst severity first, and hides on leave", () => {
    const reviews = [
      {
        findings: [
          finding({ id: "w", severity: "WARNING" }),
          finding({ id: "gone", severity: "CRITICAL", dismissed_at: "2026-09-01T00:00:00Z" }),
          finding({ id: "c", severity: "CRITICAL" }),
        ],
      },
    ] as unknown as ReviewRecord[];
    usePrReviews.mockImplementation((id: string | null) => ({ data: id ? reviews : undefined }));
    renderCell();

    const cell = screen.getByLabelText("1 Critical").parentElement!;
    fireEvent.mouseEnter(cell);
    const titles = screen.getAllByText(/^Finding /).map((el) => el.textContent);
    expect(titles).toEqual(["Finding c", "Finding w"]);

    fireEvent.mouseLeave(cell);
    expect(screen.queryByText(/^Finding /)).not.toBeInTheDocument();
  });

  it("renders an empty cell when the PR has no counts", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsCell prId="pr-1" counts={null} />
      </NextIntlClientProvider>,
    );
    expect(container.firstElementChild!.childElementCount).toBe(0);
  });
});
