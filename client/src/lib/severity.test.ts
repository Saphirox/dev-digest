/**
 * Severity rules — the order every severity surface shares, and the counts
 * the chips/pills display.
 */
import { describe, it, expect } from "vitest";
import { SEVERITIES, countBySeverity, sortBySeverity } from "./severity";

const f = (id: string, severity: string) => ({ id, severity });

describe("SEVERITIES", () => {
  it("lists the contract severities worst first", () => {
    expect(SEVERITIES).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
  });
});

describe("sortBySeverity", () => {
  it("orders CRITICAL → WARNING → SUGGESTION", () => {
    const out = sortBySeverity([f("s", "SUGGESTION"), f("c", "CRITICAL"), f("w", "WARNING")]);
    expect(out.map((x) => x.id)).toEqual(["c", "w", "s"]);
  });

  it("puts unknown severities last and keeps ties in input order", () => {
    const out = sortBySeverity([f("i", "INFO"), f("w1", "WARNING"), f("c", "CRITICAL"), f("w2", "WARNING")]);
    expect(out.map((x) => x.id)).toEqual(["c", "w1", "w2", "i"]);
  });

  it("does not mutate its input", () => {
    const input = [f("s", "SUGGESTION"), f("c", "CRITICAL")];
    sortBySeverity(input);
    expect(input.map((x) => x.id)).toEqual(["s", "c"]);
  });
});

describe("countBySeverity", () => {
  it("counts each contract severity and starts every key at zero", () => {
    expect(countBySeverity([f("a", "CRITICAL"), f("b", "CRITICAL"), f("c", "SUGGESTION")])).toEqual({
      CRITICAL: 2,
      WARNING: 0,
      SUGGESTION: 1,
    });
  });

  it("ignores severities outside the contract", () => {
    expect(countBySeverity([f("a", "INFO"), f("b", "WARNING")])).toEqual({
      CRITICAL: 0,
      WARNING: 1,
      SUGGESTION: 0,
    });
  });
});
