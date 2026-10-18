import type { LogLine } from "@devdigest/ui";
import type { ProjectContextEntry, RunTrace } from "@devdigest/shared";

interface RawEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}

/** Map a persisted trace's log to the LiveLogStream LogLine shape. */
export function traceLog(trace: RunTrace | undefined): LogLine[] {
  return trace?.log.map((l) => ({ t: l.t, k: l.kind as LogLine["k"], m: l.msg })) ?? [];
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

export interface SpecReadRow {
  path: string;
  /** `null` when unknown (shown as "—", never 0). */
  tokens: number | null;
  status: "included" | "truncated" | "missing";
}

/**
 * The "Specs read" rows: the injected documents in injection order, each with
 * the tokens and status `project_context` recorded for it, then the attached
 * documents that were `missing`. `dropped` documents are not listed here (they
 * stay in `project_context`).
 */
export function specsReadRows(
  specsRead: string[],
  projectContext: ProjectContextEntry[] | null | undefined,
): SpecReadRow[] {
  const entries = projectContext ?? [];
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const injected = specsRead.map((path): SpecReadRow => {
    const entry = byPath.get(path);
    const status = entry?.status === "truncated" ? "truncated" : "included";
    return { path, tokens: entry?.tokens ?? null, status };
  });
  const missing = entries
    .filter((e) => e.status === "missing" && !specsRead.includes(e.path))
    .map((e): SpecReadRow => ({ path: e.path, tokens: e.tokens, status: "missing" }));
  return [...injected, ...missing];
}
