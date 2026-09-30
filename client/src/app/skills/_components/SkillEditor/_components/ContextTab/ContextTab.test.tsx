import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import contextMessages from "../../../../../../../messages/en/context.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({ useUpdateSkill: () => ({ mutate }) }));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "repo1" }) }));
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => ({
    data: {
      cloned: true,
      files: [
        { path: "specs/public-api.md", type: "specs", tokens: 105 },
        { path: "docs/architecture.md", type: "docs", tokens: 40 },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useContextFile: () => ({ data: undefined, isLoading: true, isError: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const SKILL = { id: "sk1", name: "pr-quality-rubric", context_paths: ["specs/public-api.md"] } as Skill;

function renderTab(skill: Skill = SKILL) {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages, skills: skillsMessages }}>
      <ContextTab skill={skill} />
    </NextIntlClientProvider>,
  );
}

describe("skill ContextTab", () => {
  it("AC-13: heading, attached badge and the inherit line", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    expect(screen.getByText("1 attached")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
  });

  it("AC-14: ticking a document saves the ordered context_paths through the skill update", () => {
    renderTab();
    fireEvent.click(within(screen.getByTestId("context-row-docs/architecture.md")).getByRole("checkbox"));
    expect(mutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { context_paths: ["specs/public-api.md", "docs/architecture.md"] } },
      expect.any(Object),
    );
  });

  it("AC-15: SERIALIZES AS lists the attached paths under '## Project specifications'", () => {
    renderTab();
    expect(screen.getByText("SERIALIZES AS")).toBeInTheDocument();
    expect(screen.getByTestId("serializes-as").textContent).toBe("## Project specifications\n- specs/public-api.md");
  });

  it("AC-16: footer shows the attached tokens with ≈ and no injection note", () => {
    renderTab();
    expect(screen.getByText("≈ 105 tokens")).toBeInTheDocument();
    expect(screen.queryByText(/Injected as an untrusted block/)).not.toBeInTheDocument();
  });

  it("NFR-7: the icon-only Preview button is named after the file", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Preview public-api.md" })).toBeInTheDocument();
  });
});
