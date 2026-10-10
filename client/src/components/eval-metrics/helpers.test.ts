import { describe, it, expect } from "vitest";
import type { EvalTrendPoint } from "@devdigest/shared";
import { formatDelta, formatPassed, formatPct, formatRanAt, sparkValues } from "./helpers";

describe("formatPct", () => {
  it("EC-6: null is a dash, never 0% or 100%", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(undefined)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
  });
  it("rounds a fraction to whole percent, keeping a real 0", () => {
    expect(formatPct(0.8234)).toBe("82%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(1)).toBe("100%");
  });
});

describe("formatDelta", () => {
  it("AC-18: signs the change in percentage points", () => {
    expect(formatDelta(0.04)).toEqual({ text: "+4 pt", direction: "up", points: 4 });
    expect(formatDelta(-0.02)).toEqual({ text: "−2 pt", direction: "down", points: 2 });
    expect(formatDelta(0.0125)).toEqual({ text: "+1.3 pt", direction: "up", points: 1.3 });
  });
  it("is flat at zero and absent without a previous run", () => {
    expect(formatDelta(0)).toEqual({ text: "0 pt", direction: "flat", points: 0 });
    expect(formatDelta(null)).toBeNull();
    expect(formatDelta(undefined)).toBeNull();
  });
});

describe("sparkValues", () => {
  const point = (recall: number | null): EvalTrendPoint => ({
    run_id: "r",
    ran_at: "2026-10-01T00:00:00Z",
    agent_version: 1,
    recall,
    precision: null,
    citation_accuracy: null,
  });
  it("AC-38: skips unknown points instead of turning them into 0", () => {
    expect(sparkValues([point(0.5), point(null), point(0.7)], "recall")).toEqual([0.5, 0.7]);
    expect(sparkValues([point(0.5)], "precision")).toEqual([]);
  });
});

describe("formatPassed / formatRanAt", () => {
  it("shows passed/total, or a dash while the count is unknown", () => {
    expect(formatPassed(17, 20)).toBe("17/20");
    expect(formatPassed(0, 3)).toBe("0/3");
    expect(formatPassed(null, 3)).toBe("—");
  });
  it("formats a timestamp as local YYYY-MM-DD HH:mm", () => {
    expect(formatRanAt(new Date(2026, 4, 9, 9, 4).toISOString())).toBe("2026-05-09 09:04");
    expect(formatRanAt("not a date")).toBe("—");
  });
});
