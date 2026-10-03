"use client";

import React from "react";

/**
 * Opens a collapsible once per new deep-link focus (`?file=`): while `active`
 * (the focused path is this component's own), a path not seen before calls
 * `open`. Adjusted during render, keyed on the focused path, so a later manual
 * collapse sticks. `open` must only set this component's own state.
 */
export function useOpenOnFocus(active: boolean, focusPath: string | null, open: () => void): void {
  const [seenFocus, setSeenFocus] = React.useState<string | null>(null);
  if (active && focusPath !== seenFocus) {
    setSeenFocus(focusPath);
    open();
  }
}
