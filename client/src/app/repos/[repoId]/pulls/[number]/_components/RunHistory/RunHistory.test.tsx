/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, ReviewRecord, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.0013,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], reviews: ReviewRecord[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} reviews={reviews} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "perf",
    title: "A finding",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "Because of reasons.",
    suggestion: null,
    confidence: 0.86,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 38,
    model: null,
    grounding: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  };
}

/** run-1 with one WARNING and one CRITICAL, deliberately warning-first. */
const REVIEW_WITH_FINDINGS = review({
  findings: [
    finding({ id: "f-w", severity: "WARNING", title: "N+1 query in user list endpoint" }),
    finding({
      id: "f-c",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded Stripe secret key in commit",
      file: "src/config.ts",
      start_line: 12,
      end_line: 12,
      confidence: 0.98,
    }),
  ],
});

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("shows tokens and cost on a settled run", () => {
    renderRuns([run({ status: "done", tokens_in: 2098, tokens_out: 59, cost_usd: 0.00012215 })]);
    expect(screen.getByText("2,157 tok · $0.000122")).toBeInTheDocument();
  });

  it("shows no cost at all on a failed run — not $0.00", () => {
    renderRuns([run({ status: "failed", error: "boom", tokens_in: 0, tokens_out: 0, cost_usd: null })]);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("does not claim '0 tok' when only the cost was recorded", () => {
    renderRuns([run({ status: "done", tokens_in: null, tokens_out: null, cost_usd: 0.00012215 })]);
    expect(screen.getByText("$0.000122")).toBeInTheDocument();
    expect(screen.queryByText(/0 tok/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — per-run severity chips + hover preview", () => {
  it("a run matched to a review shows chips instead of the plain findings text", () => {
    renderRuns(
      [run({ status: "done", findings_count: 2, blockers: 1, score: 38 })],
      [REVIEW_WITH_FINDINGS],
    );
    expect(screen.queryByText(/2 finding\(s\)/)).not.toBeInTheDocument();
    // the blockers note survives next to the chips (its " · " is baked into the string)
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
  });

  it("hovering the chips previews that run's findings, worst severity first", () => {
    renderRuns(
      [run({ status: "done", findings_count: 2, blockers: 1, score: 38 })],
      [REVIEW_WITH_FINDINGS],
    );
    expect(screen.queryByText("2 findings in this run")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText(/1 blockers/).parentElement!);

    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
    const titles = screen
      .getAllByText(/Stripe secret key|N\+1 query/)
      .map((el) => el.textContent);
    expect(titles[0]).toMatch(/Stripe secret key/); // CRITICAL sorted above WARNING
    expect(titles[1]).toMatch(/N\+1 query/);
  });

  it("hides the preview again on mouse leave", () => {
    renderRuns(
      [run({ status: "done", findings_count: 2, blockers: 1, score: 38 })],
      [REVIEW_WITH_FINDINGS],
    );
    const chips = screen.getByText(/1 blockers/).parentElement!;
    fireEvent.mouseEnter(chips);
    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
    fireEvent.mouseLeave(chips);
    expect(screen.queryByText("2 findings in this run")).not.toBeInTheDocument();
  });

  it("renders each severity as a bare chip, named for assistive tech", () => {
    renderRuns(
      [run({ status: "done", findings_count: 2, blockers: 1, score: 38 })],
      [REVIEW_WITH_FINDINGS],
    );
    const crit = screen.getByLabelText("1 Critical");
    expect(crit).toBeInTheDocument();
    expect(screen.getByLabelText("1 Warning")).toBeInTheDocument();
    // the design calls for a bare chip, not SeverityBadge's filled pill:
    // no background, and a dotted underline as the hover affordance
    expect(crit.style.background).toBe("");
    expect(crit.style.backgroundColor).toBe("");
    expect(crit.style.borderBottom).toContain("dotted");
    expect(crit.style.borderRadius).toBe("");
    expect(crit.getAttribute("title")).toBeNull();
  });

  it("puts no title anywhere in the hover card (help-cursor regression)", () => {
    // ConfidenceNum hardcodes title="Model confidence", which made the browser
    // show a "?" cursor over the card; the card must stay tooltip-free.
    const { container } = renderRuns(
      [run({ status: "done", findings_count: 2, blockers: 1, score: 38 })],
      [REVIEW_WITH_FINDINGS],
    );
    fireEvent.mouseEnter(screen.getByText(/1 blockers/).parentElement!);
    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
    const card = container.querySelector<HTMLElement>('[style*="position: fixed"]');
    expect(card).not.toBeNull();
    expect(card!.querySelectorAll("[title]")).toHaveLength(0);
    // ...and the confidence readout is still there
    expect(screen.getByText(/98% conf/)).toBeInTheDocument();
  });

  it("falls back to the plain text when the run has no matching review", () => {
    // e.g. the review was deleted, or the run produced only a summary
    renderRuns([run({ run_id: "run-other", status: "done", findings_count: 3, blockers: 0 })], [
      REVIEW_WITH_FINDINGS,
    ]);
    expect(screen.getByText(/3 finding\(s\)/)).toBeInTheDocument();
  });

  it("falls back to the plain text when the matched review kept no findings", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0 })], [review({ findings: [] })]);
    expect(screen.getByText(/0 finding\(s\)/)).toBeInTheDocument();
  });
});
