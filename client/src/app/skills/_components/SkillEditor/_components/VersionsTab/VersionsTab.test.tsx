import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const updateMutate = vi.fn();
const VERSIONS: SkillVersion[] = [
  { skill_id: "s1", version: 2, body: "a\nnew", created_at: "2026-09-19T10:00:00Z" },
  { skill_id: "s1", version: 1, body: "a\nold", created_at: "2026-09-18T10:00:00Z" },
];

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false }),
}));

import { VersionsTab } from "./VersionsTab";

const SKILL: Skill = {
  id: "s1",
  name: "rubric",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "a\nnew",
  enabled: true,
  version: 2,
  evidence_files: null,
};

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => updateMutate.mockReset());
afterEach(cleanup);

describe("VersionsTab", () => {
  it("lists every version; only past ones get Diff and Restore", () => {
    renderTab();
    const current = within(screen.getByTestId("version-2"));
    const past = within(screen.getByTestId("version-1"));
    expect(current.queryByRole("button", { name: /Diff/ })).not.toBeInTheDocument();
    expect(past.getByRole("button", { name: /Diff/ })).toBeInTheDocument();
    expect(past.getByRole("button", { name: /Restore/ })).toBeInTheDocument();
  });

  it("Diff shows the changes from that version to the current body", () => {
    renderTab();
    fireEvent.click(within(screen.getByTestId("version-1")).getByRole("button", { name: /Diff/ }));
    const diff = screen.getByLabelText("Changes from v1 to the current version");
    expect(within(diff).getByText("- old")).toBeInTheDocument();
    expect(within(diff).getByText("+ new")).toBeInTheDocument();
  });

  it("Restore saves the old body as a new version", () => {
    renderTab();
    fireEvent.click(within(screen.getByTestId("version-1")).getByRole("button", { name: /Restore/ }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "s1", patch: { body: "a\nold" } }, expect.anything());
  });
});
