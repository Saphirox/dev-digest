/**
 * PR detail page — only the PR Brief -> Files changed hand-off (AC-17/AC-27):
 * activating a review-focus item of a PR file must move the URL to `?tab=diff`
 * with that file focused, and the Files changed tab must receive it. The shell,
 * header and the other tabs are stubs; the real PrBriefBlock renders the item.
 */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../messages/en/prReview.json";

let query = "";
const replace = vi.fn((url: string) => {
  query = url.split("?")[1] ?? "";
});
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1", number: "7" }),
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr-1", number: 7 }], isLoading: false }),
  usePullDetail: () => ({
    data: {
      number: 7,
      head_sha: "head111",
      body: "PR description",
      status: "open",
      files_count: 1,
      commits: [],
      files: [{ path: "docs/notes.md", additions: 1, deletions: 0 }],
    },
    isLoading: false,
    isError: false,
  }),
  usePrBrief: () => ({
    data: {
      summary: "Brief summary",
      risks: [],
      review_focus: [{ file: "docs/notes.md", line: 3, reason: "docs claim" }],
      file_summaries: [],
      generated_for_sha: "head111",
      generated_at: "2026-10-02T00:00:00.000Z",
      missing_inputs: [],
      cost_usd: null,
      tokens_in: null,
      tokens_out: null,
    },
    isLoading: false,
  }),
  usePrBlast: () => ({ data: undefined }),
  useGenerateBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({}),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => null }));
vi.mock("./_components/PrDetailHeader", () => ({ PrDetailHeader: ({ tab }: { tab: string }) => <div>tab:{tab}</div> }));
vi.mock("./_components/OverviewTab", () => ({ OverviewTab: () => null }));
vi.mock("./_components/IntentCard", () => ({ IntentCard: () => null }));
vi.mock("./_components/BlastRadiusCard", () => ({ BlastRadiusCard: () => null }));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => null }));
vi.mock("./_components/RunTraceDrawer", () => ({ default: () => null }));
vi.mock("./_components/DiffTab", () => ({
  DiffTab: ({ focusPath }: { focusPath?: string | null }) => <div>files changed, focus: {focusPath ?? "none"}</div>,
}));

import PRDetailPage from "./page";

function ui() {
  return (
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      <PRDetailPage />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  query = "";
  replace.mockClear();
});
afterEach(cleanup);

describe("PR detail page", () => {
  it("AC-17/AC-27: opening a PR file from the brief switches to ?tab=diff and focuses that file", () => {
    const { rerender } = render(ui());
    expect(screen.getByText("tab:overview")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "docs/notes.md:3" }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/repos/repo-1/pulls/7?tab=diff&file=docs%2Fnotes.md");

    rerender(ui());
    expect(screen.getByText("tab:diff")).toBeInTheDocument();
    expect(screen.getByText("files changed, focus: docs/notes.md")).toBeInTheDocument();
  });
});
