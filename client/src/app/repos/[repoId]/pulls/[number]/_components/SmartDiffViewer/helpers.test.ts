/**
 * `SmartDiffViewer/helpers.ts` — pure functions, no React
 * (`docs/plans/0009-smart-diff-spec-completion.md` step 9). Mirrors the
 * server's `latestFindingRangesForPull` distinct-on-agent rule.
 * `severityForFlaggedLines` guards the 0004 correctness fix a plan-verifier
 * caught: a marker must never render for a line the server didn't flag, even
 * if the client's severity map has an entry for it.
 */
import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import {
  buildSeverityByFile,
  findingsByFile,
  filesWithFindings,
  hasReviewRun,
  partitionFileFindings,
  severityForFlaggedLines,
} from "./helpers";

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
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
  it("the worse severity wins when two findings flag the same start_line", () => {
    const reviews: ReviewRecord[] = [
      review({
        agent_id: "agent-1",
        findings: [
          finding({ id: "f1", severity: "WARNING", file: "a.ts", start_line: 5 }),
          finding({ id: "f2", severity: "CRITICAL", file: "a.ts", start_line: 5 }),
        ],
      }),
    ];
    const byFile = buildSeverityByFile(reviews);
    expect(byFile.get("a.ts")?.get(5)).toBe("CRITICAL");
  });

  it("does no range expansion — only start_line gets a colour (Decision 7)", () => {
    const reviews: ReviewRecord[] = [
      review({ agent_id: "agent-1", findings: [finding({ file: "a.ts", start_line: 5, end_line: 20 })] }),
    ];
    const byFile = buildSeverityByFile(reviews);
    expect(byFile.get("a.ts")?.get(5)).toBe("WARNING");
    expect(byFile.get("a.ts")?.has(10)).toBe(false);
  });

  it("skips dismissed findings (Decision 6)", () => {
    const reviews: ReviewRecord[] = [
      review({
        agent_id: "agent-1",
        findings: [finding({ file: "a.ts", start_line: 5, dismissed_at: "2026-01-02T00:00:00.000Z" })],
      }),
    ];
    expect(buildSeverityByFile(reviews).has("a.ts")).toBe(false);
  });

  it("only the newest review per agent_id counts — an older review's findings are dropped", () => {
    const agent = "agent-1";
    const reviews: ReviewRecord[] = [
      review({
        id: "older",
        agent_id: agent,
        created_at: "2026-01-01T00:00:00.000Z",
        findings: [finding({ id: "f-old", severity: "CRITICAL", file: "a.ts", start_line: 1 })],
      }),
      review({
        id: "newer",
        agent_id: agent,
        created_at: "2026-01-02T00:00:00.000Z",
        findings: [finding({ id: "f-new", severity: "SUGGESTION", file: "a.ts", start_line: 2 })],
      }),
    ];
    const byFile = buildSeverityByFile(reviews);
    expect(byFile.get("a.ts")?.get(1)).toBeUndefined();
    expect(byFile.get("a.ts")?.get(2)).toBe("SUGGESTION");
  });

  it('ignores kind === "summary" reviews entirely', () => {
    const reviews: ReviewRecord[] = [
      review({ kind: "summary", agent_id: "agent-1", findings: [finding({ file: "summary-only.ts", start_line: 1 })] }),
    ];
    expect(buildSeverityByFile(reviews).has("summary-only.ts")).toBe(false);
  });

  it("null agent_ids collapse into ONE group — the newest null-agent review wins", () => {
    const reviews: ReviewRecord[] = [
      review({
        id: "null-older",
        agent_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        findings: [finding({ file: "b.ts", start_line: 1 })],
      }),
      review({
        id: "null-newer",
        agent_id: null,
        created_at: "2026-01-02T00:00:00.000Z",
        findings: [finding({ file: "b.ts", start_line: 2 })],
      }),
    ];
    const byFile = buildSeverityByFile(reviews);
    expect(byFile.get("b.ts")?.has(1)).toBe(false);
    expect(byFile.get("b.ts")?.has(2)).toBe(true);
  });
});

describe("severityForFlaggedLines", () => {
  it("a line the client can colour but that is NOT in the server's finding_lines gets no marker", () => {
    const severityByLine = new Map<number, "CRITICAL" | "WARNING" | "SUGGESTION">([
      [5, "CRITICAL"],
      [6, "WARNING"],
    ]);
    const result = severityForFlaggedLines(severityByLine, [5]);
    expect(result.get(5)).toBe("CRITICAL");
    expect(result.has(6)).toBe(false);
  });

  it("undefined client map yields an empty result for any flagged lines", () => {
    expect(severityForFlaggedLines(undefined, [1, 2, 3]).size).toBe(0);
  });
});

describe("findingsByFile", () => {
  it("includes dismissed findings — partitionFileFindings needs the full list", () => {
    const reviews: ReviewRecord[] = [
      review({
        agent_id: "agent-1",
        findings: [finding({ id: "f1", file: "a.ts", dismissed_at: "2026-01-02T00:00:00.000Z" })],
      }),
    ];
    expect(findingsByFile(reviews).get("a.ts")?.map((f) => f.id)).toEqual(["f1"]);
  });
});

describe("partitionFileFindings", () => {
  it("a non-dismissed finding on a rendered, in-scope line is inline", () => {
    const f = finding({ id: "f1", start_line: 5 });
    const { inlineByKey, offPatch } = partitionFileFindings([f], new Set(["RIGHT:5"]), [5]);
    expect(inlineByKey.get("RIGHT:5")?.map((x) => x.id)).toEqual(["f1"]);
    expect(offPatch).toEqual([]);
  });

  it("a finding whose key isn't rendered (patch null, or line dropped) is off-patch", () => {
    const f = finding({ id: "f1", start_line: 5 });
    const { inlineByKey, offPatch } = partitionFileFindings([f], new Set(), [5]);
    expect(inlineByKey.size).toBe(0);
    expect(offPatch.map((x) => x.id)).toEqual(["f1"]);
  });

  it("a dismissed finding on a rendered line is inline even though it's excluded from finding_lines", () => {
    const f = finding({ id: "f1", start_line: 5, dismissed_at: "2026-01-02T00:00:00.000Z" });
    // Server excludes dismissed findings from `finding_lines` (Decision 6) —
    // an empty findingLines array here mirrors that.
    const { inlineByKey, offPatch } = partitionFileFindings([f], new Set(["RIGHT:5"]), []);
    expect(inlineByKey.get("RIGHT:5")?.map((x) => x.id)).toEqual(["f1"]);
    expect(offPatch).toEqual([]);
  });

  it("a non-dismissed finding with a rendered key but missing from finding_lines is shown nowhere (query skew)", () => {
    const f = finding({ id: "f1", start_line: 5 });
    const { inlineByKey, offPatch } = partitionFileFindings([f], new Set(["RIGHT:5"]), []);
    expect(inlineByKey.size).toBe(0);
    expect(offPatch).toEqual([]);
  });
});

describe("filesWithFindings", () => {
  it("counts only files with a non-empty finding_lines", () => {
    const files = [
      { path: "a.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [1] },
      { path: "b.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
    ];
    expect(filesWithFindings(files)).toBe(1);
  });
});

describe("hasReviewRun", () => {
  it("true only when a kind === 'review' row exists", () => {
    expect(hasReviewRun([review({ kind: "summary" })])).toBe(false);
    expect(hasReviewRun([review({ kind: "review" })])).toBe(true);
    expect(hasReviewRun(undefined)).toBe(false);
  });
});
