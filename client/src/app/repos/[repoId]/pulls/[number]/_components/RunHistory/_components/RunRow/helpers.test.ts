/**
 * RunRow helpers — the "0 tok" guard in isolation (the rendered case lives in
 * RunHistory.test.tsx).
 */
import { describe, it, expect } from "vitest";
import { totalTokens } from "./helpers";

describe("totalTokens", () => {
  it("sums both sides", () => {
    expect(totalTokens({ tokens_in: 100, tokens_out: 50 })).toBe(150);
  });

  it("treats one missing side as zero when the other was recorded", () => {
    expect(totalTokens({ tokens_in: 100, tokens_out: null })).toBe(100);
  });

  it("is null — not 0 — when neither side was recorded", () => {
    expect(totalTokens({ tokens_in: null, tokens_out: null })).toBeNull();
  });
});
