/* MetricBar — a metric as a thin bar plus its percentage ("82%", or "—" when
   unknown: an empty bar, never a full or zero one). The number is the signal;
   the bar is decoration (aria-hidden). */
import React from "react";
import { formatPct } from "./helpers";
import { s } from "./styles";

export function MetricBar({ value, color }: { value: number | null; color: string }) {
  return (
    <span style={s.barWrap}>
      <span aria-hidden="true" style={s.barTrack}>
        {value != null && <span style={s.barFill(color, value)} />}
      </span>
      <span className="tnum" style={s.barText}>
        {formatPct(value)}
      </span>
    </span>
  );
}
