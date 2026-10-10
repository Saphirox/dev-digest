/* TextDiff — a line diff between two texts: a header with "+added −removed",
   then every line marked + / − / unchanged, or `sameLabel` when nothing changed.
   Plain text only (a saved prompt is untrusted), and the +/− marks are text so
   colour is never the only signal. Labels come from the caller's namespace. */
import React from "react";
import { diffStats, lineDiff } from "./helpers";
import { s } from "./styles";

export function TextDiff({
  from,
  to,
  head,
  label,
  sameLabel,
}: {
  from: string;
  to: string;
  /** Shown before the counts, e.g. "v1 → current". */
  head: React.ReactNode;
  /** Accessible name of the diff region. */
  label: string;
  /** Shown instead of the lines when the two texts are identical. */
  sameLabel: string;
}) {
  const lines = React.useMemo(() => lineDiff(from, to), [from, to]);
  const { added, removed } = diffStats(lines);
  return (
    <div style={s.wrap} aria-label={label} role="group">
      <div style={s.head}>
        {head} · <span style={s.add}>+{added}</span> <span style={s.del}>−{removed}</span>
      </div>
      {added + removed === 0 ? (
        <div style={s.same}>{sameLabel}</div>
      ) : (
        <pre className="mono" style={s.body}>
          {lines.map((l, i) => (
            <div key={i} data-kind={l.kind} style={s.line(l.kind)}>
              {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
              {l.text}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
