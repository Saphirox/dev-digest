/**
 * RunHistory helpers — timeline ordering and the review→run findings join.
 */
import { describe, it, expect } from "vitest";
import type { PrCommit, ReviewRecord, RunSummary } from "@devdigest/shared";
import { buildTimeline, findingsByRunId, tsOf } from "./helpers";

const run = (run_id: string, ran_at: string | null) => ({ run_id, ran_at }) as RunSummary;
const commit = (sha: string, committed_at: string | null) => ({ sha, committed_at }) as PrCommit;

describe("tsOf", () => {
  it("sorts missing or unparseable timestamps as the epoch", () => {
    expect(tsOf(null)).toBe(0);
    expect(tsOf("not a date")).toBe(0);
    expect(tsOf("2026-06-11T18:44:34.000Z")).toBe(Date.parse("2026-06-11T18:44:34.000Z"));
  });
});

describe("buildTimeline", () => {
  it("interleaves runs and commits newest-first, undated items last", () => {
    const items = buildTimeline(
      [run("r-old", "2026-01-01T00:00:00Z"), run("r-new", "2026-01-03T00:00:00Z")],
      [commit("c-mid", "2026-01-02T00:00:00Z"), commit("c-none", null)],
    );
    expect(items.map((i) => (i.kind === "run" ? i.run.run_id : i.commit.sha))).toEqual([
      "r-new",
      "c-mid",
      "r-old",
      "c-none",
    ]);
  });
});

describe("findingsByRunId", () => {
  it("keys severity-sorted findings by run, skipping reviews without a run or findings", () => {
    const reviews = [
      { run_id: "r1", findings: [{ id: "s", severity: "SUGGESTION" }, { id: "c", severity: "CRITICAL" }] },
      { run_id: null, findings: [{ id: "x", severity: "WARNING" }] },
      { run_id: "r2", findings: [] },
    ] as unknown as ReviewRecord[];
    const map = findingsByRunId(reviews);
    expect([...map.keys()]).toEqual(["r1"]);
    expect(map.get("r1")!.map((f) => f.id)).toEqual(["c", "s"]);
  });
});
