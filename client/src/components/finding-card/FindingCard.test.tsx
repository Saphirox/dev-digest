import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";

// EvalCaseAction's data hook, mocked by its exact module path: no QueryClient needed.
const createCase = vi.fn();
let createState: { isPending: boolean; isError: boolean; error: Error | null } = {
  isPending: false,
  isError: false,
  error: null,
};
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalCaseFromFinding: () => ({ mutate: createCase, ...createState }),
}));

import { FindingCard } from "./FindingCard";

afterEach(() => {
  cleanup();
  createCase.mockReset();
  createState = { isPending: false, isError: false, error: null };
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Reject"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard — hideLocation (Smart Diff inline card)", () => {
  it("without hideLocation (Findings tab default), the file:line/confidence row is present", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
  });

  it("with hideLocation, the file:line/confidence row is absent", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} hideLocation />);
    expect(screen.queryByText("src/config.ts:11")).not.toBeInTheDocument();
    // The rest of the card is unaffected — title still renders.
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
  });
});

describe("FindingCard — Turn into eval case", () => {
  const caseFor = (kind: "must_find" | "must_not_flag") => ({
    case: { expected_output: { kind, file: "src/config.ts", start_line: 11, end_line: 11 } },
    created: true,
  });

  const btn = () => screen.queryByRole("button", { name: "Turn into eval case" });

  it("AC-1/AC-6: an accepted finding becomes a case in one click, with no kind, and shows must find", () => {
    createCase.mockImplementation((_v, opts) => opts.onSuccess(caseFor("must_find")));
    renderWithIntl(<FindingCard f={{ ...FINDING, accepted_at: "2026-10-01T00:00:00Z" }} defaultExpanded />);
    fireEvent.click(btn()!);
    expect(createCase).toHaveBeenCalledTimes(1);
    const vars = createCase.mock.calls[0]?.[0];
    expect(vars).toEqual({ findingId: "f1" });
    expect("kind" in vars).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Eval case · must find");
    expect(btn()).not.toBeInTheDocument();
  });

  it("AC-2: a dismissed finding becomes a case in one click, with no kind, and shows must not flag", () => {
    createCase.mockImplementation((_v, opts) => opts.onSuccess(caseFor("must_not_flag")));
    renderWithIntl(<FindingCard f={{ ...FINDING, dismissed_at: "2026-10-01T00:00:00Z" }} defaultExpanded />);
    fireEvent.click(btn()!);
    const vars = createCase.mock.calls[0]?.[0];
    expect(vars).toEqual({ findingId: "f1" });
    expect("kind" in vars).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Eval case · must not flag");
  });

  it("EC-1: an undecided finding has no Turn into eval case button and no chooser", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded />);
    expect(btn()).not.toBeInTheDocument();
    expect(screen.queryByText("Which expectation?")).not.toBeInTheDocument();
    expect(createCase).not.toHaveBeenCalled();
  });

  it("AC-1: the button appears as soon as the finding prop becomes decided", () => {
    const { rerender } = renderWithIntl(<FindingCard f={FINDING} defaultExpanded />);
    expect(btn()).not.toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingCard f={{ ...FINDING, accepted_at: "2026-10-01T00:00:00Z" }} defaultExpanded />
      </NextIntlClientProvider>,
    );
    expect(btn()).toBeInTheDocument();
  });

  it("EC-2: an existing case (created: false) is shown the same way", () => {
    createCase.mockImplementation((_v, opts) => opts.onSuccess({ ...caseFor("must_find"), created: false }));
    renderWithIntl(<FindingCard f={{ ...FINDING, accepted_at: "2026-10-01T00:00:00Z" }} defaultExpanded />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(screen.getByRole("status")).toHaveTextContent("Eval case · must find");
  });

  it("EC-3/EC-4/EC-22: a refusal shows its reason inline and keeps the button", () => {
    createState = { isPending: false, isError: true, error: new Error("no diff available for src/config.ts") };
    renderWithIntl(<FindingCard f={{ ...FINDING, accepted_at: "2026-10-01T00:00:00Z" }} defaultExpanded />);
    expect(screen.getByRole("alert")).toHaveTextContent("no diff available for src/config.ts");
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeInTheDocument();
  });
});

describe("FindingCard — a decision does not restyle the card", () => {
  const cardOf = (title: string) => screen.getByText(title).closest("[data-finding-id]") as HTMLElement;

  it("AC-43: an accepted card is not dimmed or struck through, and shows the accepted tag", () => {
    renderWithIntl(<FindingCard f={{ ...FINDING, accepted_at: "2026-10-01T00:00:00Z" }} />);
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(cardOf(FINDING.title).style.opacity).toBe("");
    expect(screen.getByText(FINDING.title).style.textDecoration).not.toContain("line-through");
    expect(screen.getByText(FINDING.title).style.color).toBe("var(--text-primary)");
  });

  it("AC-43: a rejected card is not dimmed or struck through, and shows the rejected tag", () => {
    renderWithIntl(<FindingCard f={{ ...FINDING, dismissed_at: "2026-10-01T00:00:00Z" }} />);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(cardOf(FINDING.title).style.opacity).toBe("");
    expect(screen.getByText(FINDING.title).style.textDecoration).not.toContain("line-through");
    expect(screen.getByText(FINDING.title).style.color).toBe("var(--text-primary)");
  });

  it("AC-43: the chosen decision button is visibly pressed; the other is not", () => {
    renderWithIntl(<FindingCard f={{ ...FINDING, accepted_at: "2026-10-01T00:00:00Z" }} defaultExpanded />);
    const accept = screen.getByRole("button", { name: "Accept" });
    expect(accept).toHaveAttribute("aria-pressed", "true");
    expect(accept.style.color).toBe("var(--ok)");
    expect(screen.getByRole("button", { name: "Reject" })).toHaveAttribute("aria-pressed", "false");
  });

  it("AC-43: an undecided card has no tag", () => {
    renderWithIntl(<FindingCard f={FINDING} />);
    expect(screen.queryByText("accepted")).not.toBeInTheDocument();
    expect(screen.queryByText("rejected")).not.toBeInTheDocument();
  });
});
