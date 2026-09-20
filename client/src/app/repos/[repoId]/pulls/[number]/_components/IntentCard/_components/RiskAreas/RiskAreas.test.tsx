/**
 * RiskAreas — the deterministic risk-scan section mounted inside
 * `<IntentCard>`. No test exercised this component before this file
 * (plan-verifier finding on `docs/plans/0003-intent-card-risk-areas.md`).
 * Guards: one row per risk, the ref link is built from the server's
 * `derived_for_sha` (NOT a page-level `headSha` prop — `RiskAreas`/`RiskRow`
 * no longer take one, per the fix pass), single-line vs range ref formatting,
 * per-row expand/collapse, the empty state, and `repoFullName: null` →
 * plain text with no link role.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/intent.json";

const usePrRisks = vi.fn();

vi.mock("@/lib/hooks", () => ({
  usePrRisks: (prId: string | null) => usePrRisks(prId),
}));

import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);
beforeEach(() => {
  usePrRisks.mockReset();
});

const AUTH_RISK: Risk = {
  kind: "auth_surface",
  title: "Auth surface touched",
  explanation: "Added lines touch 1 auth-related file — review authentication changes carefully.",
  severity: "high",
  refs: [{ file: "src/middleware/ratelimit.ts", start_line: 12, end_line: 18 }],
};

const DEP_RISK: Risk = {
  kind: "new_dependency",
  title: "New dependency: ioredis",
  explanation: 'package.json adds a new dependency "ioredis" at version "^5.4.1".',
  severity: "medium",
  refs: [{ file: "package.json", start_line: 34, end_line: 34 }],
};

function renderSection(repoFullName: string | null = "acme/widgets") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
      <RiskAreas prId="pr-1" repoFullName={repoFullName} />
    </NextIntlClientProvider>,
  );
}

describe("RiskAreas", () => {
  it("renders one row per risk, formats a multi-line ref as path:start-end and a single-line ref as path:line, and links to the derived_for_sha blob", () => {
    usePrRisks.mockReturnValue({
      data: {
        pr_id: "pr-1",
        derived_for_sha: "sha-derived-123",
        risks: [AUTH_RISK, DEP_RISK],
        scanned: { files: 2, added_lines: 2 },
      },
      isLoading: false,
      isError: false,
    });
    renderSection();

    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("New dependency: ioredis")).toBeInTheDocument();

    const rangeLink = screen.getByRole("link", { name: "src/middleware/ratelimit.ts:12-18" });
    expect(rangeLink).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/sha-derived-123/src/middleware/ratelimit.ts#L12-L18",
    );

    const singleLink = screen.getByRole("link", { name: "package.json:34" });
    expect(singleLink).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/sha-derived-123/package.json#L34",
    );
  });

  it("hides the explanation until the chevron is clicked, and expanding one row leaves the other collapsed", () => {
    usePrRisks.mockReturnValue({
      data: {
        pr_id: "pr-1",
        derived_for_sha: "sha-derived-123",
        risks: [AUTH_RISK, DEP_RISK],
        scanned: { files: 2, added_lines: 2 },
      },
      isLoading: false,
      isError: false,
    });
    renderSection();

    expect(screen.queryByText(AUTH_RISK.explanation)).not.toBeInTheDocument();
    expect(screen.queryByText(DEP_RISK.explanation)).not.toBeInTheDocument();

    const expandButtons = screen.getAllByRole("button", { name: "Show details" });
    expect(expandButtons).toHaveLength(2);
    fireEvent.click(expandButtons[0]!);

    expect(screen.getByText(AUTH_RISK.explanation)).toBeInTheDocument();
    expect(screen.queryByText(DEP_RISK.explanation)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide details" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Show details" })).toHaveLength(1);
  });

  it("does not collide two performance risks with the same kind+title but different files — expanding one leaves the other collapsed", () => {
    // Regression for the reviewer finding: `detectPerformance` emits one risk
    // per (pattern label, file) but its title omits the file, so two request-
    // path files can produce byte-identical kind+title risks.
    const PERF_A: Risk = {
      kind: "performance",
      title: "Adds fetch round-trip per request",
      explanation: "src/routes/a.ts adds a fetch call in a request-handling path.",
      severity: "medium",
      refs: [{ file: "src/routes/a.ts", start_line: 5, end_line: 5 }],
    };
    const PERF_B: Risk = {
      kind: "performance",
      title: "Adds fetch round-trip per request",
      explanation: "src/routes/b.ts adds a fetch call in a request-handling path.",
      severity: "medium",
      refs: [{ file: "src/routes/b.ts", start_line: 9, end_line: 9 }],
    };
    usePrRisks.mockReturnValue({
      data: {
        pr_id: "pr-1",
        derived_for_sha: "sha-derived-123",
        risks: [PERF_A, PERF_B],
        scanned: { files: 2, added_lines: 2 },
      },
      isLoading: false,
      isError: false,
    });
    renderSection();

    const expandButtons = screen.getAllByRole("button", { name: "Show details" });
    expect(expandButtons).toHaveLength(2);
    fireEvent.click(expandButtons[0]!);

    expect(screen.getByText(PERF_A.explanation)).toBeInTheDocument();
    expect(screen.queryByText(PERF_B.explanation)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Show details" })).toHaveLength(1);
  });

  it('renders "No risk areas detected in this diff." when risks is empty', () => {
    usePrRisks.mockReturnValue({
      data: { pr_id: "pr-1", derived_for_sha: "sha-derived-123", risks: [], scanned: { files: 1, added_lines: 0 } },
      isLoading: false,
      isError: false,
    });
    renderSection();

    expect(screen.getByText("No risk areas detected in this diff.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an error message on a query error, never a fabricated row", () => {
    usePrRisks.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderSection();

    expect(screen.getByText("Couldn't load risk areas.")).toBeInTheDocument();
  });

  it("with repoFullName: null, the ref renders as plain text with no link role", () => {
    usePrRisks.mockReturnValue({
      data: {
        pr_id: "pr-1",
        derived_for_sha: "sha-derived-123",
        risks: [AUTH_RISK],
        scanned: { files: 1, added_lines: 1 },
      },
      isLoading: false,
      isError: false,
    });
    renderSection(null);

    expect(screen.getByText("src/middleware/ratelimit.ts:12-18")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
