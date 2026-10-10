import { describe, it, expect } from "vitest";
import type { RunSummary } from "@devdigest/shared";
import { footerEstimate, formatEstimate, formatRunMeta, formatSeconds, sumKnown, wallClockMs } from "./run-estimate";

const run = (over: Partial<RunSummary>): RunSummary => ({
  run_id: "r",
  agent_id: "a",
  agent_name: "A",
  provider: null,
  model: null,
  status: "done",
  error: null,
  duration_ms: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  findings_count: null,
  grounding: null,
  ran_at: null,
  score: null,
  blockers: null,
  ...over,
});

describe("run-estimate", () => {
  it("NFR-3: unknown duration or cost renders —, never 0", () => {
    expect(formatSeconds(null)).toBe("—");
    expect(formatSeconds(8200)).toBe("8.2s");
    expect(formatSeconds(6000, 0)).toBe("6s");
    expect(formatEstimate({ avg_duration_ms: null, avg_cost_usd: null })).toBe("— · —");
    expect(formatEstimate({ avg_duration_ms: 8200, avg_cost_usd: 0.06 })).toBe("8.2s · $0.0600");
    expect(formatEstimate(undefined)).toBe("— · —");
    expect(formatRunMeta({ duration_ms: null, cost_usd: null })).toBe("— · —");
    expect(formatRunMeta({ duration_ms: 8200, cost_usd: 0.06 })).toBe("8.2s · $0.0600");
  });

  it("AC-16: footer = max of known durations, sum of known costs", () => {
    const f = footerEstimate([
      { avg_duration_ms: 8200, avg_cost_usd: 0.06 },
      { avg_duration_ms: null, avg_cost_usd: null },
      { avg_duration_ms: 7400, avg_cost_usd: 0.05 },
    ]);
    expect(f.durationMs).toBe(8200);
    expect(f.costUsd).toBeCloseTo(0.11);
    expect(footerEstimate([{ avg_duration_ms: null, avg_cost_usd: null }])).toEqual({
      durationMs: null,
      costUsd: null,
    });
    expect(footerEstimate([])).toEqual({ durationMs: null, costUsd: null });
  });

  it("AC-21: wall clock runs from the parent start to the last child end", () => {
    const runs = [
      run({ ran_at: "2026-01-01T00:00:00.000Z", duration_ms: 6000 }),
      run({ ran_at: "2026-01-01T00:00:01.000Z", duration_ms: 8000 }),
      run({ ran_at: null, duration_ms: null, status: "failed" }),
    ];
    expect(wallClockMs("2026-01-01T00:00:00.000Z", runs)).toBe(9000);
    expect(wallClockMs("2026-01-01T00:00:00.000Z", [run({ status: "failed" })])).toBeNull();
    expect(wallClockMs("2026-01-01T00:00:00.000Z", [...runs, run({ status: "running" })])).toBeNull();
  });

  it("sumKnown skips nulls and is null when nothing is known", () => {
    expect(sumKnown([0.06, null, 0.04])).toBeCloseTo(0.1);
    expect(sumKnown([null, undefined])).toBeNull();
  });
});
