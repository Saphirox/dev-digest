import { CARD_OFFSET_Y, CARD_WIDTH, VIEWPORT_MARGIN } from "./constants";

export type PreviewAnchor = { top: number; left: number };

/** Viewport position for a card opened under `rect`: just below it, left-aligned
 *  with it, and clamped so the card never spills past either viewport edge. */
export function anchorBelow(
  rect: Pick<DOMRect, "bottom" | "left">,
  viewportWidth: number,
): PreviewAnchor {
  const maxLeft = viewportWidth - CARD_WIDTH - VIEWPORT_MARGIN;
  return {
    top: rect.bottom + CARD_OFFSET_Y,
    left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft)),
  };
}
