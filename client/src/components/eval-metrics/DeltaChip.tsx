/* DeltaChip — a signed change with an arrow and an accessible name. The sign and
   arrow carry the direction; colour only repeats it (NFR-6). */
import React from "react";
import { Icon } from "@devdigest/ui";
import type { DeltaDirection } from "./helpers";
import { s } from "./styles";

const COLOR: Record<DeltaDirection, string> = {
  up: "var(--ok)",
  down: "var(--crit)",
  flat: "var(--text-muted)",
};
const ARROW = { up: Icon.ArrowUp, down: Icon.ArrowDown, flat: Icon.Slash } as const;

export function DeltaChip({
  name,
  text,
  direction,
  neutral,
}: {
  /** Accessible name, e.g. "Recall: up 4 points". */
  name: string;
  /** Visible signed text, e.g. "+4 pt". */
  text: string;
  direction: DeltaDirection;
  /** Don't colour it good/bad (a cost going up isn't inherently either). */
  neutral?: boolean;
}) {
  const Arrow = ARROW[direction];
  return (
    <span role="img" aria-label={name} style={s.delta(neutral ? "var(--text-secondary)" : COLOR[direction])}>
      <Arrow size={12} aria-hidden="true" />
      <span className="tnum" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
