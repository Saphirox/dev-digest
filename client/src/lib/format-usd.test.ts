/**
 * formatUsd — the guard against the two ways a cost display goes wrong:
 * rounding a real charge down to "$0.00", and showing "$0.00" for a cost we
 * simply don't know.
 */
import { describe, it, expect } from "vitest";
import { formatUsd } from "./format-usd";

describe("formatUsd", () => {
  it.each([
    [0.0013452, "$0.00135"],
    [0.014, "$0.0140"],
    [0.06, "$0.0600"],
    [1.234, "$1.23"],
    [123.456, "$123.46"],
  ])("keeps 3 significant digits: %s → %s", (input, expected) => {
    expect(formatUsd(input)).toBe(expected);
  });

  it("renders an exact zero as $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it.each([[null], [undefined]])("renders %s as an em dash, never $0.00", (input) => {
    expect(formatUsd(input)).toBe("—");
  });

  it("never rounds a real charge down to $0.00", () => {
    expect(formatUsd(0.0000001)).not.toBe("$0.00");
  });

  it("survives a non-finite value rather than printing $NaN", () => {
    expect(formatUsd(Number.NaN)).toBe("—");
  });
});
