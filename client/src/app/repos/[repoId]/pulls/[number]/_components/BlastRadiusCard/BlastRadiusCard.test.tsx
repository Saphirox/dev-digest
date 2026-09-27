/**
 * BlastRadiusCard — Overview tab, right column (docs/plans/0011-blast-radius.md).
 * Guards: stats-row counts, callers rendered under their own symbol with the
 * exact GitHub `#L` blob href, the `noCallers` text for a zero-caller symbol,
 * the degraded notice (reason text + resync shown/hidden per reason), the
 * Tree/Graph toggle, and `repoFullName: null` giving no link role (per the
 * `MonoLink`-without-`href` insight — plain mono text instead).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadius } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";

const usePrBlast = vi.fn();
const usePrPriorPrs = vi.fn();
const useResyncRepoIntel = vi.fn();
const useRepoIntelStatus = vi.fn();

vi.mock("@/lib/hooks", () => ({
  usePrBlast: (prId: string | null) => usePrBlast(prId),
  usePrPriorPrs: (prId: string | null, open: boolean) => usePrPriorPrs(prId, open),
  useResyncRepoIntel: (repoId: string | null) => useResyncRepoIntel(repoId),
  useRepoIntelStatus: (repoId: string | null, poll: boolean) => useRepoIntelStatus(repoId, poll),
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(cleanup);
beforeEach(() => {
  usePrBlast.mockReset();
  usePrPriorPrs.mockReset();
  usePrPriorPrs.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  useResyncRepoIntel.mockReset();
  useResyncRepoIntel.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useRepoIntelStatus.mockReset();
  useRepoIntelStatus.mockReturnValue({ data: undefined });
});

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" },
    { name: "bucketKey", file: "src/middleware/ratelimit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      file: "src/middleware/ratelimit.ts",
      callers: [
        { name: "publicRouter", file: "src/api/public/index.ts", line: 23 },
        { name: "webhookHandler", file: "src/api/public/webhooks.ts", line: 45 },
      ],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: ["reset-rate-buckets (hourly)"],
      rank: 5,
    },
    {
      symbol: "bucketKey",
      file: "src/middleware/ratelimit.ts",
      callers: [],
      endpoints_affected: [],
      crons_affected: [],
      rank: 1,
    },
  ],
  summary: null,
  indexed_sha: "indexed-sha-1",
};

function renderCard(props: Partial<React.ComponentProps<typeof BlastRadiusCard>> = {}) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusCard
          prId="pr-1"
          repoId="repo-1"
          headSha="head-sha-1"
          repoFullName="acme/widgets"
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("BlastRadiusCard", () => {
  it("renders the stats row counts derived from the blast payload", () => {
    usePrBlast.mockReturnValue({ data: BLAST, isLoading: false, isError: false });
    renderCard();

    expect(screen.getByLabelText("2 symbols")).toBeInTheDocument();
    expect(screen.getByLabelText("2 callers")).toBeInTheDocument();
    // Singular ICU forms: 1 endpoint / 1 cron/job, not "1 endpoints" / "1 cron/jobs".
    expect(screen.getByLabelText("1 endpoint")).toBeInTheDocument();
    expect(screen.getByLabelText("1 cron/job")).toBeInTheDocument();
  });

  it('uses singular ICU forms ("1 symbol", "1 caller") at count=1, both in the stats row and the symbol row\'s caller badge', () => {
    usePrBlast.mockReturnValue({
      data: {
        changed_symbols: [{ name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" }],
        downstream: [
          {
            symbol: "rateLimit",
            file: "src/middleware/ratelimit.ts",
            callers: [{ name: "publicRouter", file: "src/api/public/index.ts", line: 23 }],
            endpoints_affected: [],
            crons_affected: [],
            rank: 1,
          },
        ],
        summary: null,
      },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByLabelText("1 symbol")).toBeInTheDocument();
    expect(screen.getByLabelText("1 caller")).toBeInTheDocument();
    // SymbolRow's own caller-count badge (SymbolRow.tsx:41), not the stats row.
    expect(screen.getByText("1 caller")).toBeInTheDocument();
  });

  it("renders callers under their own symbol row with the exact GitHub #L blob href, using indexed_sha", () => {
    usePrBlast.mockReturnValue({ data: BLAST, isLoading: false, isError: false });
    renderCard();

    // First 3 rows start expanded — both rows here are within that window.
    const link = screen.getByRole("link", { name: "src/api/public/index.ts:23" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/indexed-sha-1/src/api/public/index.ts#L23",
    );
  });

  it('shows "no callers" text for a symbol with zero callers', () => {
    usePrBlast.mockReturnValue({ data: BLAST, isLoading: false, isError: false });
    renderCard();

    expect(
      screen.getByText("No callers found in the indexed code; nothing else references this symbol."),
    ).toBeInTheDocument();
  });

  it("repoFullName: null renders callers as plain mono text with no link role", () => {
    usePrBlast.mockReturnValue({ data: BLAST, isLoading: false, isError: false });
    renderCard({ repoFullName: null });

    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("toggles between Tree and Graph view", () => {
    usePrBlast.mockReturnValue({ data: BLAST, isLoading: false, isError: false });
    renderCard();

    // Tree view by default: caller rows are visible.
    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.queryByText("src/api/public/index.ts:23")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tree" }));
    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
  });

  it("shows the degraded notice with its reason text and a resync button for a fixable reason", () => {
    usePrBlast.mockReturnValue({
      data: { ...BLAST, degraded: true, reason: "index_partial" },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByRole("status")).toHaveTextContent(
      "The repo index is only partially built",
    );
    expect(screen.getByRole("button", { name: "Resync repo index" })).toBeInTheDocument();
  });

  it("hides the resync button for a reason resync cannot fix (flag_off)", () => {
    usePrBlast.mockReturnValue({
      data: { ...BLAST, degraded: true, reason: "flag_off" },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByRole("status")).toHaveTextContent("Repo indexing is turned off");
    expect(screen.queryByRole("button", { name: "Resync repo index" })).not.toBeInTheDocument();
  });

  it("renders nothing while loading and an error message on failure", () => {
    usePrBlast.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();

    cleanup();
    usePrBlast.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderCard();
    expect(screen.getByText("Couldn't load the blast radius.")).toBeInTheDocument();
  });

  it("renders the empty state when there are no changed symbols, with no degraded notice for a healthy repo", () => {
    usePrBlast.mockReturnValue({
      data: { changed_symbols: [], downstream: [], summary: null },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByText("No changed symbols found in this diff.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the degraded notice alongside the empty state for an unindexed repo (no_data)", () => {
    usePrBlast.mockReturnValue({
      data: {
        changed_symbols: [],
        downstream: [],
        summary: null,
        degraded: true,
        reason: "no_data",
        indexed_sha: null,
      },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByRole("status")).toHaveTextContent(
      "No indexed data is available for this repo yet.",
    );
    expect(screen.getByText("No changed symbols found in this diff.")).toBeInTheDocument();
  });

  it("pages endpoint chips 10 at a time, and back to 10 with Show less", () => {
    const manyEndpoints = Array.from({ length: 23 }, (_, i) => `GET /e${i}`);
    usePrBlast.mockReturnValue({
      data: {
        ...BLAST,
        downstream: [
          { ...BLAST.downstream[0], endpoints_affected: manyEndpoints },
          BLAST.downstream[1],
        ],
      },
      isLoading: false,
      isError: false,
    });
    renderCard();

    const endpointGroup = () => screen.getByRole("group", { name: "Endpoints" });
    expect(within(endpointGroup()).getAllByText(/^GET \/e/)).toHaveLength(10);
    // Cron chip stays visible throughout.
    expect(screen.getByText("reset-rate-buckets (hourly)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show 10 more endpoints" }));
    expect(within(endpointGroup()).getAllByText(/^GET \/e/)).toHaveLength(20);
    expect(screen.getByText("reset-rate-buckets (hourly)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show 3 more endpoints" }));
    expect(within(endpointGroup()).getAllByText(/^GET \/e/)).toHaveLength(23);
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
    expect(screen.getByText("reset-rate-buckets (hourly)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(within(endpointGroup()).getAllByText(/^GET \/e/)).toHaveLength(10);
    expect(screen.getByText("reset-rate-buckets (hourly)")).toBeInTheDocument();
  });

  it("shows no show-more/show-less button for 10 or fewer endpoints", () => {
    const tenEndpoints = Array.from({ length: 10 }, (_, i) => `GET /e${i}`);
    usePrBlast.mockReturnValue({
      data: {
        ...BLAST,
        downstream: [
          { ...BLAST.downstream[0], endpoints_affected: tenEndpoints },
          BLAST.downstream[1],
        ],
      },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(within(screen.getByRole("group", { name: "Endpoints" })).getAllByText(/^GET \/e/)).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /show .* more|show less/i })).not.toBeInTheDocument();
  });
});
