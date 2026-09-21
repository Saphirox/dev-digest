/**
 * `SmartDiffViewer/helpers.ts` — pure functions, no React. Mirrors the
 * server's `latestFindingRangesForPull` distinct-on-agent rule
 * (`docs/plans/0004-smart-diff.md`). `severityForFlaggedLines` guards the
 * 0004 correctness fix a plan-verifier caught: a marker must never render for
 * a line the server didn't flag, even if the client's severity map has an
 * entry for it (`docs/plans/0005-smart-diff-ui-fidelity.md`, "risks").
 */
import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import {
  buildSeverityByFile,
  countFindingsBySeverityByFile,
  severityForFlaggedLines,
} from "./helpers";

function finding(overrides: Partial<ReviewRecord["findings"][number]> = {}): ReviewRecord["findings"][number] {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    severity: "WARNING",
    category: "bug",
    title: "fixture finding",
    file: "src/app.ts",
    start_line: 10,
    end_line: 10,
    rationale: "fixture",
    suggestion: null,
    confidence: 0.8,
    kind: "finding",
    review_id: "review-1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    pr_id: "pr-1",
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00.000Z",
    findings: [],
    ...overrides,
  };
}

describe("buildSeverityByFile", () => {
  it("the worse severity wins when two findings flag the same line", () => {
    const agent = "agent-1";
    const reviews: ReviewRecord[] = [
      review({
        agent_id: agent,
        created_at: "2026-01-01T00:00:00.000Z",
        findings: [
          finding({ id: "f1", severity: "WARNING", file: "a.ts", start_line: 5, end_line: 5, review_id: "r1" }),
          finding({ id: "f2", severity: "CRITICAL", file: "a.ts", start_line: 5, end_line: 5, review_id: "r1" }),
        ],
      }),
    ];
    const byFile = buildSeverityByFile(reviews);
    expect(byFile.get("a.ts")?.get(5)).toBe("CRITICAL");
  });

  it("only the newest review per agent_id counts — an older review's findings are dropped", () => {
    const agent = "agent-1";
    const reviews: ReviewRecord[] = [
      review({
        id: "older",
        agent_id: agent,
        created_at: "2026-01-01T00:00:00.000Z",
        findings: [finding({ id: "f-old", severity: "CRITICAL", file: "a.ts", start_line: 1, end_line: 1, review_id: "older" })],
      }),
      review({
        id: "newer",
        agent_id: agent,
        created_at: "2026-01-02T00:00:00.000Z",
        findings: [finding({ id: "f-new", severity: "SUGGESTION", file: "a.ts", start_line: 2, end_line: 2, review_id: "newer" })],
      }),
    ];
    const byFile = buildSeverityByFile(reviews);
    expect(byFile.get("a.ts")?.get(1)).toBeUndefined(); // the older review's line is not counted
    expect(byFile.get("a.ts")?.get(2)).toBe("SUGGESTION"); // only the newer review's line is
  });

  it('ignores kind === "summary" reviews entirely', () => {
    const reviews: ReviewRecord[] = [
      review({
        kind: "summary",
        agent_id: "agent-1",
        findings: [finding({ file: "summary-only.ts", start_line: 1, end_line: 1 })],
      }),
    ];
    const byFile = buildSeverityByFile(reviews);
    expect(byFile.has("summary-only.ts")).toBe(false);
  });

  it("null agent_ids collapse into ONE group — the newest null-agent review wins, not each independently", () => {
    const reviews: ReviewRecord[] = [
      review({
        id: "null-older",
        agent_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        findings: [finding({ file: "b.ts", start_line: 1, end_line: 1, review_id: "null-older" })],
      }),
      review({
        id: "null-newer",
        agent_id: null,
        created_at: "2026-01-02T00:00:00.000Z",
        findings: [finding({ file: "b.ts", start_line: 2, end_line: 2, review_id: "null-newer" })],
      }),
    ];
    const byFile = buildSeverityByFile(reviews);
    expect(byFile.get("b.ts")?.has(1)).toBe(false);
    expect(byFile.get("b.ts")?.has(2)).toBe(true);
  });
});

describe("countFindingsBySeverityByFile", () => {
  it("counts findings, not the lines they span", () => {
    const reviews: ReviewRecord[] = [
      review({
        agent_id: "agent-1",
        findings: [
          finding({ id: "f1", file: "app.ts", start_line: 91, end_line: 109 }), // spans 19 lines
          finding({ id: "f2", file: "app.ts", start_line: 110, end_line: 112 }), // spans 3 lines
        ],
      }),
    ];
    // The badge once read "22 findings" for these two — it was summing the
    // LINES they span. Guard that regression against the per-severity counts.
    const counts = countFindingsBySeverityByFile(reviews).get("app.ts");
    expect(counts?.WARNING).toBe(2); // not 22 (19 + 3)
    const total = Object.values(counts ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBe(2);
  });

  it("splits the tally per severity, worst-first order coming from SEVERITIES", () => {
    const reviews: ReviewRecord[] = [
      review({
        agent_id: "agent-1",
        findings: [
          finding({ id: "c1", severity: "CRITICAL", file: "app.ts" }),
          finding({ id: "w1", severity: "WARNING", file: "app.ts" }),
          finding({ id: "w2", severity: "WARNING", file: "app.ts" }),
        ],
      }),
    ];
    const counts = countFindingsBySeverityByFile(reviews).get("app.ts");
    expect(counts?.CRITICAL).toBe(1);
    expect(counts?.WARNING).toBe(2);
    expect(counts?.SUGGESTION ?? 0).toBe(0);
  });

describe("severityForFlaggedLines", () => {
  it("a line the client can colour but that is NOT in the server's finding_lines gets no marker", () => {
    const severityByLine = new Map<number, "CRITICAL" | "WARNING" | "SUGGESTION">([
      [5, "CRITICAL"],
      [6, "WARNING"],
    ]);
    // Server only flagged line 5 — line 6 must be excluded even though the
    // client has a colour for it.
    const result = severityForFlaggedLines(severityByLine, [5]);
    expect(result.get(5)).toBe("CRITICAL");
    expect(result.has(6)).toBe(false);
  });

  it("undefined client map yields an empty result for any flagged lines", () => {
    expect(severityForFlaggedLines(undefined, [1, 2, 3]).size).toBe(0);
  });
});
});
