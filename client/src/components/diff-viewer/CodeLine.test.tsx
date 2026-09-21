/**
 * CodeLine — the per-line severity badge (gap 3 of
 * `docs/plans/0005-smart-diff-ui-fidelity.md`) and the byte-identical
 * no-severity path `DiffViewer` relies on (0004's regression that matters).
 * The badge's visible text IS `SEV[sev].label` ("Critical"/"Warning"/
 * "Suggestion") — the lowercase look in the design is CSS `text-transform`,
 * not different text — and it must NOT be `aria-hidden` (unlike the old dot,
 * which was decorative).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Line } from "./helpers";
import { CodeLine } from "./CodeLine";

afterEach(cleanup);

const ADD_LINE: Line = { kind: "add", newNo: 42, text: "const x = 1;" };

function renderLine(severity?: "CRITICAL" | "WARNING" | "SUGGESTION" | null) {
  return render(<CodeLine ln={ADD_LINE} path="src/app.ts" threads={[]} severity={severity} />);
}

describe("CodeLine — severity badge", () => {
  it.each([
    ["CRITICAL", /critical/i],
    ["WARNING", /warning/i],
    ["SUGGESTION", /suggestion/i],
  ] as const)("severity=%s renders a visible, non-decorative badge matching %s", (severity, pattern) => {
    renderLine(severity);
    const badge = screen.getByText(pattern);
    expect(badge).toBeInTheDocument();
    // The old dot was `aria-hidden` because it was purely decorative; the new
    // badge carries the accessible name and must stay visible to AT.
    expect(badge.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("no severity prop → no badge is rendered and the row is otherwise unaffected", () => {
    renderLine(undefined);
    expect(screen.queryByText(/critical|warning|suggestion/i)).not.toBeInTheDocument();
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });
});
