import { describe, it, expect } from "vitest";
import type { EvalSuiteRun } from "@devdigest/shared";
import { comparePair, parsePeriod, promoteBlock } from "./helpers";

const run = (id: string, started_at: string, status: EvalSuiteRun["status"] = "done"): EvalSuiteRun => ({
  id,
  agent_id: "ag1",
  agent_version: 1,
  status,
  started_at,
  finished_at: null,
  recall: 0.5,
  precision: 0.5,
  citation_accuracy: 0.5,
  cases_passed: 1,
  cases_total: 2,
  cost_usd: null,
  error: null,
  failing_case: null,
  model: "m",
  provider: "p",
});

describe("parsePeriod", () => {
  it("AC-39: defaults to 30 days and accepts the four options", () => {
    expect(parsePeriod(null)).toBe("30d");
    expect(parsePeriod("bogus")).toBe("30d");
    expect(parsePeriod("7d")).toBe("7d");
    expect(parsePeriod("90d")).toBe("90d");
    expect(parsePeriod("all")).toBe("all");
  });
});

describe("comparePair", () => {
  const runs = [run("new", "2026-05-29T09:00:00Z"), run("mid", "2026-05-27T09:00:00Z"), run("old", "2026-05-19T09:00:00Z")];
  it("AC-20: needs exactly two selected done runs, returned oldest first", () => {
    expect(comparePair(runs, ["new", "old"])?.map((r) => r.id)).toEqual(["old", "new"]);
    expect(comparePair(runs, ["new"])).toBeNull();
    expect(comparePair(runs, ["new", "mid", "old"])).toBeNull();
    expect(comparePair(runs, [])).toBeNull();
  });
  it("ignores selected runs that are not done", () => {
    const withFailed = [...runs, run("bad", "2026-05-30T09:00:00Z", "failed")];
    expect(comparePair(withFailed, ["new", "bad"])).toBeNull();
  });
});

describe("promoteBlock", () => {
  it("EC-16: the current version cannot be promoted", () => {
    expect(promoteBlock(7, 7, [6, 7])).toBe("current");
  });
  it("EC-25: a version with no snapshot cannot be promoted", () => {
    expect(promoteBlock(6, 8, [7, 8])).toBe("noSnapshot");
  });
  it("waits for the version list, then allows an older snapshotted version", () => {
    expect(promoteBlock(6, 8, undefined)).toBe("loading");
    expect(promoteBlock(7, 8, [6, 7, 8])).toBeNull();
  });
});
