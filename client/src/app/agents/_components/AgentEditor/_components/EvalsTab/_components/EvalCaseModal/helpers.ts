import type { EvalExpectation } from "@devdigest/shared";

/** Starting point for a new case's expected output. */
export const NEW_EXPECTATION_JSON = JSON.stringify(
  { kind: "must_find", file: "", start_line: 1, end_line: 1 },
  null,
  2,
);

export function expectationToJson(e: EvalExpectation): string {
  return JSON.stringify(e, null, 2);
}

/** The text parsed as a JSON object, or `null` when it does not parse (EC-20).
 *  Whether the object is a sound expectation is the server's call (422). */
export function parseExpectationJson(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type DiffLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

/** How a unified-diff line is shown: + / − bodies, @@ hunks, file headers, context. */
export function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ")) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}
