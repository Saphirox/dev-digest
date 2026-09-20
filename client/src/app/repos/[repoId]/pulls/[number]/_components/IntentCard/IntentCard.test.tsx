/**
 * IntentCard — the Overview-tab intent summary. Guards: the intent sentence +
 * both scope columns render from data, the missing-context block only shows
 * when non-empty, a `null` record renders the empty state (not a crash), and
 * the re-derive button issues the POST (via the mocked mutation).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/intent.json";

const usePrIntent = vi.fn();
const deriveMutate = vi.fn();
const useDeriveIntent = vi.fn((_prId: string | null) => ({ mutate: deriveMutate, isPending: false }));
// <IntentCard> mounts <RiskAreas>, which calls usePrRisks — mocked here too
// (maintenance of this existing mock, not new coverage; RiskAreas itself is
// untested this iteration per the plan's USER OVERRIDE).
const usePrRisks = vi.fn();

vi.mock("@/lib/hooks", () => ({
  usePrIntent: (prId: string | null) => usePrIntent(prId),
  useDeriveIntent: (prId: string | null) => useDeriveIntent(prId),
  usePrRisks: (prId: string | null) => usePrRisks(prId),
}));

import { IntentCard } from "./IntentCard";

afterEach(cleanup);
beforeEach(() => {
  usePrIntent.mockReset();
  deriveMutate.mockReset();
  useDeriveIntent.mockReturnValue({ mutate: deriveMutate, isPending: false });
  usePrRisks.mockReset();
  usePrRisks.mockReturnValue({ data: { risks: [] }, isLoading: false, isError: false });
});

function record(o: Partial<PrIntentRecord> = {}): PrIntentRecord {
  return {
    pr_id: "pr-1",
    intent: "Adds a cheap PR-intent classifier ahead of the full review.",
    in_scope: ["intent classifier", "scope filter"],
    out_of_scope: ["unrelated refactors"],
    confidence: 0.82,
    derived_for_sha: "abc1234",
    derived_at: "2026-09-20T00:00:00.000Z",
    stale: false,
    sources: [],
    missing_context: [],
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    ...o,
  };
}

function renderCard(prId: string | null = "pr-1", headSha = "abc1234") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
      <IntentCard prId={prId} headSha={headSha} repoFullName={null} />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("renders the intent sentence and both scope columns from data", () => {
    usePrIntent.mockReturnValue({ data: record(), isLoading: false });
    renderCard();

    expect(screen.getByText(/Adds a cheap PR-intent classifier/)).toBeInTheDocument();
    expect(screen.getByText("intent classifier")).toBeInTheDocument();
    expect(screen.getByText("scope filter")).toBeInTheDocument();
    expect(screen.getByText("unrelated refactors")).toBeInTheDocument();
    expect(screen.queryByText("Missing context")).not.toBeInTheDocument();
  });

  it("renders the missing-context block only when non-empty", () => {
    usePrIntent.mockReturnValue({
      data: record({ missing_context: ["docs/plans/0002-intent-layer.md"] }),
      isLoading: false,
    });
    renderCard();

    expect(screen.getByText("Missing context")).toBeInTheDocument();
    expect(screen.getByText("docs/plans/0002-intent-layer.md")).toBeInTheDocument();
  });

  it("renders the empty state when the API returns null, and re-derive issues the POST", () => {
    usePrIntent.mockReturnValue({ data: null, isLoading: false });
    renderCard();

    expect(screen.getByText("No intent derived yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /derive intent/i }));
    expect(deriveMutate).toHaveBeenCalledTimes(1);
  });

  it("clicking re-derive on an existing record issues the POST", () => {
    usePrIntent.mockReturnValue({ data: record(), isLoading: false });
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /re-derive/i }));
    expect(deriveMutate).toHaveBeenCalledTimes(1);
  });
});
