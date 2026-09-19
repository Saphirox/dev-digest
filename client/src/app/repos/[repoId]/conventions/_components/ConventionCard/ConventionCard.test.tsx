import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "../../../../../../lib/toast";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const C: ConventionCandidate = {
  id: "c1",
  rule: "Always use async/await instead of .then() chains",
  category: "general",
  rationale: null,
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });",
  evidence_line: 23,
  evidence_line_end: 24,
  confidence: 0.91,
  occurrences: 7,
  status: "pending",
  created_at: "2026-09-19T00:00:00Z",
};

function renderCard(c: ConventionCandidate = C) {
  const onStatus = vi.fn();
  const onReject = vi.fn();
  const onRule = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <ConventionCard convention={c} onStatus={onStatus} onReject={onReject} onRule={onRule} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onStatus, onReject, onRule };
}

describe("ConventionCard", () => {
  it("shows the rule, the evidence range and snippet, confidence and frequency", () => {
    renderCard();
    expect(screen.getByText(C.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-24")).toBeInTheDocument();
    expect(screen.getByText(/db\.posts\.findMany/)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("seen in 7 files")).toBeInTheDocument();
  });

  it("Accept toggles between accepted and pending", () => {
    const { onStatus } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onStatus).toHaveBeenCalledWith("accepted");
    cleanup();
    const again = renderCard({ ...C, status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(again.onStatus).toHaveBeenCalledWith("pending");
  });

  it("Reject dismisses the candidate instead of marking it", () => {
    const { onStatus, onReject } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("edits the rule inline: Enter saves, Escape cancels", () => {
    const { onRule } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: C.rule }));
    fireEvent.change(screen.getByLabelText("Edit rule"), { target: { value: "Prefer async/await" } });
    fireEvent.keyDown(screen.getByLabelText("Edit rule"), { key: "Enter" });
    expect(onRule).toHaveBeenCalledWith("Prefer async/await");

    fireEvent.click(screen.getByRole("button", { name: C.rule }));
    fireEvent.change(screen.getByLabelText("Edit rule"), { target: { value: "Discarded" } });
    fireEvent.keyDown(screen.getByLabelText("Edit rule"), { key: "Escape" });
    expect(onRule).toHaveBeenCalledTimes(1);
  });

  it("the Edit button opens the same inline editor", () => {
    const { onRule } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Edit rule"), { target: { value: "Edited" } });
    fireEvent.blur(screen.getByLabelText("Edit rule"));
    expect(onRule).toHaveBeenCalledWith("Edited");
  });

  it("copies the snippet", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Copy snippet" }));
    expect(writeText).toHaveBeenCalledWith(C.evidence_snippet);
  });
});
