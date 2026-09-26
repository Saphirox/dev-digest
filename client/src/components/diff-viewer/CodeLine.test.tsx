/**
 * CodeLine — the per-line severity badge and the byte-identical no-severity
 * path `DiffViewer` relies on. The badge's visible text IS
 * `LINE_BADGE_LABEL[sev]` (Decision 12, `docs/plans/0009-smart-diff-spec-completion.md`):
 * CRITICAL → "blocker", WARNING → "warning", SUGGESTION → "suggestion" —
 * deliberately NOT `@devdigest/ui`'s `SEV[sev].label` ("Critical"/"Warning"/
 * "Suggestion"). It must NOT be `aria-hidden` (unlike the old dot, which was
 * decorative).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Line } from "./helpers";
import type { CommentThread, DiffCommentApi } from "./comments";
import shell from "../../../messages/en/shell.json";
import { CodeLine } from "./CodeLine";

afterEach(cleanup);

const ADD_LINE: Line = { kind: "add", newNo: 42, text: "const x = 1;" };

function renderLine(severity?: "CRITICAL" | "WARNING" | "SUGGESTION" | null) {
  return render(<CodeLine ln={ADD_LINE} path="src/app.ts" threads={[]} severity={severity} />);
}

describe("CodeLine — severity badge", () => {
  it.each([
    ["CRITICAL", /blocker/i],
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
    expect(screen.queryByText(/blocker|warning|suggestion/i)).not.toBeInTheDocument();
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });
});

describe("CodeLine — extras slot ordering (docs/plans/0009-smart-diff-spec-completion.md)", () => {
  it("extras render after comment threads and before the inline composer", () => {
    const thread: CommentThread = {
      rootId: 1,
      comments: [
        {
          id: 1,
          path: "src/app.ts",
          line: 42,
          original_line: 42,
          side: "RIGHT",
          body: "Existing thread comment",
          user: "alice",
          created_at: "2024-01-01T00:00:00Z",
          html_url: "https://github.com/x/y/pull/1#comment-1",
          in_reply_to_id: null,
          is_outdated: false,
        },
      ],
      line: 42,
      side: "RIGHT",
      isOutdated: false,
    };
    const commenting: DiffCommentApi = {
      comments: [],
      canComment: true,
      showComments: true,
      posting: false,
      onSubmit: async () => undefined,
    };

    render(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <CodeLine
          ln={ADD_LINE}
          path="src/app.ts"
          threads={[thread]}
          commenting={commenting}
          extras={<div>EXTRA-MARKER</div>}
        />
      </NextIntlClientProvider>,
    );

    // Open the inline composer the same way a user would: hover the row,
    // then click the "+" add-comment affordance.
    fireEvent.mouseEnter(screen.getByText("const x = 1;").closest("div")!.parentElement!);
    fireEvent.click(screen.getByRole("button", { name: /add a comment on this line/i }));

    const threadText = screen.getByText("Existing thread comment");
    const extra = screen.getByText("EXTRA-MARKER");
    const composerBox = screen.getByPlaceholderText(shell.diffViewer.commentPlaceholder);

    // DOCUMENT_POSITION_FOLLOWING means the second node comes after the first.
    expect(
      threadText.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      extra.compareDocumentPosition(composerBox) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
