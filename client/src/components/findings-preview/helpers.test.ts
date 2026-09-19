/**
 * anchorBelow — where the hover preview card opens, and the clamp that keeps
 * it inside the viewport.
 */
import { describe, it, expect } from "vitest";
import { anchorBelow } from "./helpers";
import { CARD_OFFSET_Y, CARD_WIDTH, VIEWPORT_MARGIN } from "./constants";

describe("anchorBelow", () => {
  it("opens just below the element, left-aligned with it", () => {
    expect(anchorBelow({ bottom: 100, left: 50 }, 1200)).toEqual({ top: 100 + CARD_OFFSET_Y, left: 50 });
  });

  it("shifts left so the card's right edge stays inside the viewport", () => {
    const { left } = anchorBelow({ bottom: 0, left: 1000 }, 1200);
    expect(left).toBe(1200 - CARD_WIDTH - VIEWPORT_MARGIN);
  });

  it("never goes past the left margin, even on a viewport narrower than the card", () => {
    expect(anchorBelow({ bottom: 0, left: 0 }, 1200).left).toBe(VIEWPORT_MARGIN);
    expect(anchorBelow({ bottom: 0, left: 20 }, 300).left).toBe(VIEWPORT_MARGIN);
  });
});
