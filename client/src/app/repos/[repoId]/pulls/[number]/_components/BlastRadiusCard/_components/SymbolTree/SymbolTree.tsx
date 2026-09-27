"use client";

import type { DownstreamImpact } from "@devdigest/shared";
import { symbolKey } from "../../helpers";
import { SymbolRow } from "./SymbolRow";
import { s } from "./styles";

interface SymbolTreeProps {
  downstream: DownstreamImpact[];
  open: Set<string>;
  onToggle: (key: string) => void;
  repoFullName: string | null;
  sha: string;
}

/** One row per changed symbol, server order kept (already sorted by rank
 *  desc, then caller count desc, then name — see `blast/helpers.ts` server
 *  side). Expand state is owned by the parent (`BlastRadiusCard`), keyed by
 *  `file:symbol` so two changed files declaring the same name never share a
 *  row's open/closed state. */
export function SymbolTree({ downstream, open, onToggle, repoFullName, sha }: SymbolTreeProps) {
  return (
    <div style={s.rows}>
      {downstream.map((impact) => {
        const key = symbolKey(impact);
        return (
          <SymbolRow
            key={key}
            impact={impact}
            open={open.has(key)}
            onToggle={() => onToggle(key)}
            repoFullName={repoFullName}
            sha={sha}
          />
        );
      })}
    </div>
  );
}
