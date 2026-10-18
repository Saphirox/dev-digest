import type { LogLine } from "@devdigest/ui";
import type { RunEvent } from "@devdigest/shared";

/** Map run-bus events to the LiveLogStream line shape. */
export function eventsToLog(events: readonly RunEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}
