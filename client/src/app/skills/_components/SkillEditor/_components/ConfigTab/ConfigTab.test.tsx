import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../../../lib/toast";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
  useSkillAgents: () => ({ data: [{ id: "ag1", name: "Security Reviewer" }] }),
}));

import { ConfigTab } from "./ConfigTab";

const SKILL: Skill = {
  id: "s1",
  name: "pr-quality-rubric",
  description: "Use when reviewing any PR.",
  type: "rubric",
  source: "manual",
  body: "# PR Quality Rubric\n\nEvaluate the PR.",
  enabled: true,
  version: 5,
  evidence_files: null,
};

function renderTab(skill: Skill = SKILL) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
      <ToastProvider>
        <ConfigTab skill={skill} onDeleted={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  updateMutate.mockReset();
  deleteMutate.mockReset();
});
afterEach(cleanup);

describe("ConfigTab", () => {
  it("shows the body as a numbered file with no unsaved marker, and Save disabled", () => {
    renderTab();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("pr-quality-rubric.md")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
  });

  it("marks an edited body unsaved and saves only the fields", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# New body" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(updateMutate.mock.calls[0]![0]).toEqual({
      id: "s1",
      patch: {
        name: "pr-quality-rubric",
        description: "Use when reviewing any PR.",
        type: "rubric",
        body: "# New body",
      },
    });
  });

  it("toggles Enabled on its own, without the text fields", () => {
    renderTab();
    fireEvent.click(screen.getByRole("switch"));
    expect(updateMutate.mock.calls[0]![0]).toEqual({ id: "s1", patch: { enabled: false } });
  });

  it("shows the trust notice for an imported skill", () => {
    renderTab({ ...SKILL, source: "imported_url" });
    expect(screen.getByText(/becomes instructions in your agent's prompt/)).toBeInTheDocument();
  });

  it("deletes only after confirming in the modal, which names the agents that lose it", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/linked to 1 agent/)).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Delete skill" }));
    expect(deleteMutate.mock.calls[0]![0]).toBe("s1");
  });
});
