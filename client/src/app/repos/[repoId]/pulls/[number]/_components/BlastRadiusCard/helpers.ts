import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import { GRAPH_MAX_NODES } from "./constants";

export interface BlastTotals {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Deterministic counts for the stats row — derived during render, never
 *  stored. Endpoints/crons are deduped across symbols (the same route can be
 *  reachable from more than one changed symbol). */
export function blastTotals(blast: BlastRadius): BlastTotals {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of blast.downstream) {
    callers += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return {
    symbols: blast.changed_symbols.length,
    callers,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}

/** Stable per-row key — `file:symbol`, never an array index (two changed
 *  files can declare the same symbol name; `file` disambiguates). */
export function symbolKey(d: DownstreamImpact): string {
  return `${d.file ?? ""}:${d.symbol}`;
}

/** Mermaid labels must not contain characters the parser treats as syntax.
 *  `"` becomes `#quot;` (mermaid's own escape); `<>[]{}()|` are stripped
 *  outright rather than escaped, since a changed symbol/caller/endpoint name
 *  is untrusted repo content, not something we want to round-trip exactly. */
export function escapeMermaidLabel(label: string): string {
  return label.replace(/"/g, "#quot;").replace(/[<>[\]{}()|]/g, "");
}

export interface BlastMermaid {
  chart: string;
  /** True when the node cap (`GRAPH_MAX_NODES`) dropped at least one node. */
  truncated: boolean;
}

/**
 * `flowchart LR`: changed symbol -> callers -> endpoints (left to right),
 * matching the reference screenshot. Synthetic node ids (`n0, n1, …`) so a
 * hostile symbol/file/endpoint name can never break node syntax — only the
 * quoted LABEL carries the real text, and it is escaped first. Crons are
 * deliberately not graphed (Tree view is the only place they show); this
 * mirrors the reference, whose graph legend has exactly 3 entries.
 */
export function buildBlastMermaid(blast: BlastRadius): BlastMermaid {
  const lines: string[] = ["flowchart LR"];
  const nodeId = new Map<string, string>();
  const edges = new Set<string>();
  const symbolIds: string[] = [];
  const endpointIds: string[] = [];
  let seq = 0;
  let truncated = false;

  const node = (key: string, label: string): string | null => {
    const existing = nodeId.get(key);
    if (existing) return existing;
    if (nodeId.size >= GRAPH_MAX_NODES) {
      truncated = true;
      return null;
    }
    const id = `n${seq++}`;
    nodeId.set(key, id);
    lines.push(`${id}["${escapeMermaidLabel(label)}"]`);
    return id;
  };

  const edge = (from: string, to: string) => {
    const key = `${from}->${to}`;
    if (edges.has(key)) return;
    edges.add(key);
    lines.push(`${from} --> ${to}`);
  };

  for (const d of blast.downstream) {
    const symbolId = node(`symbol:${d.file ?? ""}:${d.symbol}`, d.symbol);
    if (!symbolId) continue;
    symbolIds.push(symbolId);

    const callerIds: string[] = [];
    for (const c of d.callers) {
      const callerId = node(`caller:${c.file}:${c.name}`, c.name);
      if (!callerId) continue;
      edge(symbolId, callerId);
      callerIds.push(callerId);
    }

    for (const ep of d.endpoints_affected) {
      const epId = node(`endpoint:${ep}`, ep);
      if (!epId) continue;
      endpointIds.push(epId);
      // No per-caller endpoint mapping exists in the contract (endpoints are
      // symbol-level) — fan every caller of this symbol into every one of
      // its endpoints; when a symbol has 0 callers, connect it directly so
      // the endpoint is still reachable in the diagram.
      const sources = callerIds.length > 0 ? callerIds : [symbolId];
      for (const from of sources) edge(from, epId);
    }
  }

  if (symbolIds.length > 0) lines.push(`class ${symbolIds.join(",")} ddSymbol`);
  if (endpointIds.length > 0) lines.push(`class ${endpointIds.join(",")} ddEndpoint`);
  lines.push("classDef ddSymbol stroke:#3b82f6,stroke-width:2px;");
  lines.push("classDef ddEndpoint stroke:#3b82f6,stroke-width:2px;");

  return { chart: lines.join("\n"), truncated };
}
