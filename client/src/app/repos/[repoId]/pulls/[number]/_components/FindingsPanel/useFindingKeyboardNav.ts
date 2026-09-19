"use client";

import React from "react";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { KEY_TO_ACTION } from "./constants";

/**
 * j/k move the focus through `shown`; a/d act on the focused finding. Keys
 * typed into a text field are ignored. Returns the focused index.
 */
export function useFindingKeyboardNav(
  shown: FindingRecord[],
  onAction: (finding: FindingRecord, action: FindingActionKind) => void,
): number {
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Toggling a filter can shrink the list past the focused index, which would
  // leave no card highlighted and make a/d silently no-op on an undefined
  // finding — re-anchor at the top whenever the list changes. Adjusted during
  // render (not in an effect) so no frame paints the stale focus.
  const [prevShown, setPrevShown] = React.useState(shown);
  if (prevShown !== shown) {
    setPrevShown(shown);
    setFocusIdx(0);
  }

  // Reads the latest shown/focus/onAction without re-subscribing on every move.
  const onKeyDown = React.useEffectEvent((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
    else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
    else {
      const action = KEY_TO_ACTION[e.key];
      const finding = shown[focusIdx];
      if (action && finding) onAction(finding, action);
    }
  });

  React.useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return focusIdx;
}
