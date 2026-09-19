import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);
beforeEach(() => mutate.mockReset());

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
  {
    id: "f2",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "One query per user.",
    suggestion: null,
    confidence: 0.86,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
  {
    id: "f3",
    severity: "CRITICAL",
    category: "bug",
    title: "Low-confidence crash path",
    file: "src/worker.ts",
    start_line: 9,
    end_line: 9,
    rationale: "Might be a false positive.",
    suggestion: null,
    confidence: 0.4,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

/** Cards currently rendered, by their titles. */
function shownTitles(): string[] {
  return FINDINGS.map((f) => f.title).filter((t) => screen.queryByText(t) !== null);
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity pills (rubric #16-18)", () => {
  it("shows one pill per severity actually present, with its count", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByLabelText("2 Critical")).toBeInTheDocument();
    expect(screen.getByLabelText("1 Warning")).toBeInTheDocument();
    // no SUGGESTION in the fixture → no pill at all (not a "0" pill)
    expect(screen.queryByLabelText(/SUGGESTION/)).not.toBeInTheDocument();
  });

  it("pill counts equal the finding cards rendered below (#17)", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(shownTitles()).toHaveLength(3); // 2 critical + 1 warning
    expect(screen.getByLabelText("2 Critical")).toBeInTheDocument();
  });

  it("clicking a pill leaves only that severity, clicking again restores (#18)", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    const crit = screen.getByLabelText("2 Critical");

    fireEvent.click(crit);
    expect(crit).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Low-confidence crash path")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();

    fireEvent.click(crit);
    expect(crit).toHaveAttribute("aria-pressed", "false");
    expect(shownTitles()).toHaveLength(3);
  });

  it("switches straight from one severity to another", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByLabelText("2 Critical"));
    fireEvent.click(screen.getByLabelText("1 Warning"));
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("keeps pill counts honest when 'hide low confidence' is on (#17)", () => {
    // the trap: one CRITICAL is below the confidence threshold. With the toggle
    // on it must vanish from BOTH the list and the pill, or the pill would
    // promise a card that isn't there.
    const { container } = renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    // re-query: the toggle collapses CRITICAL from 2 → 1
    expect(screen.queryByText("Low-confidence crash path")).not.toBeInTheDocument();
    expect(screen.getByLabelText("1 Critical")).toBeInTheDocument();
    expect(shownTitles()).toHaveLength(2);
  });
});

describe("FindingsPanel keyboard (j/k + a/d)", () => {
  // Shown order is severity-sorted: f1 (CRITICAL), f3 (CRITICAL, low conf), f2 (WARNING).
  const press = (key: string) => fireEvent.keyDown(window, { key });
  const acted = () => mutate.mock.calls.map(([arg]) => `${arg.action}:${arg.findingId}`);

  it("a/d act on the focused finding, starting at the top", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    press("a");
    press("j");
    press("d");
    expect(acted()).toEqual(["accept:f1", "dismiss:f3"]);
    expect(mutate.mock.calls[0]![0].prId).toBe("pr1");
  });

  it("j/k clamp at both ends of the list", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    press("k");
    press("a");
    press("j");
    press("j");
    press("j");
    press("j");
    press("a");
    expect(acted()).toEqual(["accept:f1", "accept:f2"]);
  });

  it("re-anchors at the top when the shown list changes, so a/d never no-op", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    press("j");
    press("j"); // focus on f2, index 2
    fireEvent.click(screen.getByRole("switch")); // hides f3 → list shrinks to 2
    press("a");
    expect(acted()).toEqual(["accept:f1"]);
  });

  it("ignores shortcuts typed into a text field", () => {
    renderWithIntl(
      <>
        <input aria-label="search" />
        <FindingsPanel findings={FINDINGS} prId="pr1" />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("search"), { key: "a" });
    expect(mutate).not.toHaveBeenCalled();
  });
});
