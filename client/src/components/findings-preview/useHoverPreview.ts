"use client";

import React from "react";
import { anchorBelow, type PreviewAnchor } from "./helpers";

/**
 * Open/close state + anchor for a `FindingsPreviewCard`. Spread the handlers on
 * the hovered element and render the card as a DOM CHILD of it: `onMouseLeave`
 * follows DOM containment, so the pointer can travel into the fixed-positioned
 * card without dismissing it.
 */
export function useHoverPreview() {
  const [anchor, setAnchor] = React.useState<PreviewAnchor | null>(null);
  const onMouseEnter = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    setAnchor(anchorBelow(e.currentTarget.getBoundingClientRect(), window.innerWidth));
  }, []);
  const onMouseLeave = React.useCallback(() => setAnchor(null), []);
  return { anchor, onMouseEnter, onMouseLeave };
}
