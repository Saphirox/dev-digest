/* AgentCard — one selectable agent on Configure run: checkbox, icon, name,
   estimate ("8.2s · $0.0600", "—" per unknown half) and a summary line. */
"use client";

import { Checkbox, Icon } from "@devdigest/ui";
import { s } from "./styles";

export function AgentCard({
  name,
  summary,
  estimate,
  checked,
  onToggle,
}: {
  name: string;
  summary: string;
  estimate: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={s.card(checked)}>
      <Checkbox
        checked={checked}
        onChange={onToggle}
        label={
          <span style={s.body}>
            <span style={s.tile}>
              <Icon.Cpu size={18} />
            </span>
            <span style={s.text}>
              <span style={{ ...s.name, display: "block" }}>{name}</span>
              {summary && <span style={{ ...s.summary, display: "block" }}>{summary}</span>}
            </span>
            <span className="mono tnum" style={s.estimate}>
              {estimate}
            </span>
          </span>
        }
      />
    </div>
  );
}
