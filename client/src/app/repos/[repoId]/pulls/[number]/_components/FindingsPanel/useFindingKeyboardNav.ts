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

  // The listener reads the latest shown/focus/onAction through a ref, so it is
  // subscribed once instead of on every move. (Not React.useEffectEvent: that
  // is React 19.2, but Next 15's App Router runs its own bundled React without
  // it, so the hook crashed in the browser while unit tests passed.)
  const latest = React.useRef({ shown, focusIdx, onAction });
  React.useEffect(() => {
    latest.current = { shown, focusIdx, onAction };
  });

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { shown, focusIdx, onAction } = latest.current;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else {
        const action = KEY_TO_ACTION[e.key];
        const finding = shown[focusIdx];
        if (action && finding) onAction(finding, action);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return focusIdx;
}
