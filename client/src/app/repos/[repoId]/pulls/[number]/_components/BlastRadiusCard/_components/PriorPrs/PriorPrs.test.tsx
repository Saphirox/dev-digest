/**
 * PriorPrs — the collapsed "Prior PRs touching these files" footer.
 * Guard: `usePrPriorPrs` is called with `open: false` before the footer is
 * expanded (so it fetches nothing) and `open: true` only after — see
 * `hooks/blast.ts`'s "zero requests until expanded" contract.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/blast.json";

const usePrPriorPrs = vi.fn();

vi.mock("@/lib/hooks", () => ({
  usePrPriorPrs: (prId: string | null, open: boolean) => usePrPriorPrs(prId, open),
}));

import { PriorPrs } from "./PriorPrs";

afterEach(cleanup);
beforeEach(() => {
  usePrPriorPrs.mockReset();
  usePrPriorPrs.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

function renderFooter() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <PriorPrs prId="pr-1" />
    </NextIntlClientProvider>,
  );
}

describe("PriorPrs", () => {
  it("calls the hook with open: false before expanding, and open: true after", () => {
    renderFooter();
    expect(usePrPriorPrs).toHaveBeenCalledWith("pr-1", false);

    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));
    expect(usePrPriorPrs).toHaveBeenCalledWith("pr-1", true);
  });

  it("shows loading, then the list once data arrives, with the overlap count", () => {
    usePrPriorPrs.mockReturnValue({
      data: {
        history: [
          { pr_number: 410, title: "Add health check route", merged_at: "2026-01-01T00:00:00Z", author: "a", files_overlap: ["a.ts", "b.ts"], notes: "" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    renderFooter();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));

    expect(screen.getByText("Add health check route")).toBeInTheDocument();
    expect(screen.getByText("2 files overlap")).toBeInTheDocument();
  });

  it('uses the singular ICU form ("1 file overlaps"), not "1 files overlap"', () => {
    usePrPriorPrs.mockReturnValue({
      data: {
        history: [
          { pr_number: 410, title: "Add health check route", merged_at: "2026-01-01T00:00:00Z", author: "a", files_overlap: ["a.ts"], notes: "" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    renderFooter();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));

    expect(screen.getByText("1 file overlaps")).toBeInTheDocument();
  });

  it('shows "none" when the expanded fetch returns no history', () => {
    usePrPriorPrs.mockReturnValue({ data: { history: [] }, isLoading: false, isError: false });
    renderFooter();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));

    expect(screen.getByText("No prior PRs found touching these files.")).toBeInTheDocument();
  });
});
