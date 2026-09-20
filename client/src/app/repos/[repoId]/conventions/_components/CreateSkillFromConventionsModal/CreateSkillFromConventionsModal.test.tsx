import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const mutate = vi.fn();
const linkMutate = vi.fn();
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate, isPending: false }),
  useLinkSkill: () => ({ mutate: linkMutate, isPending: false }),
}));
vi.mock("../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "ag1", name: "API Contract Reviewer" }] }),
}));

import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

beforeEach(() => {
  mutate.mockReset();
  linkMutate.mockReset();
});
afterEach(cleanup);

const DRAFT = {
  name: "repo-conventions",
  description: "3 house conventions extracted from payments-api",
  type: "convention" as const,
  body: "# repo-conventions\n\n## rule-one\nRule one.",
  convention_count: 3,
};

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
      <ToastProvider>
        <CreateSkillFromConventionsModal draft={DRAFT} repoName="payments-api" onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("CreateSkillFromConventionsModal", () => {
  it("prefills the draft and saves it as an extracted skill", () => {
    renderModal();
    expect(screen.getByText("3 accepted conventions")).toBeInTheDocument();
    expect(screen.getByText("repo-conventions.md")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "House rules" } });
    fireEvent.click(screen.getByRole("switch")); // Enabled off
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(mutate.mock.calls[0]![0]).toEqual({
      name: "repo-conventions",
      description: "House rules",
      type: "convention",
      body: DRAFT.body,
      source: "extracted",
      enabled: false,
    });
    mutate.mock.calls[0]![1].onSuccess({ id: "sk1", name: "repo-conventions" });
    expect(linkMutate).not.toHaveBeenCalled();
  });

  it("links the new skill to the picked agent", () => {
    const onClose = renderModal();
    fireEvent.change(screen.getByDisplayValue("Don't attach now"), { target: { value: "ag1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    mutate.mock.calls[0]![1].onSuccess({ id: "sk1", name: "repo-conventions" });
    expect(linkMutate.mock.calls[0]![0]).toEqual({ agentId: "ag1", skillId: "sk1" });
    linkMutate.mock.calls[0]![1].onSettled();
    expect(onClose).toHaveBeenCalled();
  });
});
