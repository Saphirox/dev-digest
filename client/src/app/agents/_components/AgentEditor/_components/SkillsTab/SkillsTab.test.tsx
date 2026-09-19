import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillDetail, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";

const mutate = vi.fn();
let linked: AgentSkillDetail[] = [];
let all: Skill[] = [];

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useAgentSkills: () => ({ data: linked, isLoading: false }),
  useSkills: () => ({ data: all, isLoading: false }),
  useSetAgentSkills: () => ({ mutate }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function skill(name: string, over: Partial<Skill> = {}): Skill {
  return {
    id: `id-${name}`,
    name,
    description: "",
    type: "security",
    source: "manual",
    body: "b",
    enabled: true,
    version: 1,
    evidence_files: null,
    ...over,
  };
}
const link = (sk: Skill, order: number, link_enabled: boolean): AgentSkillDetail => ({
  ...sk,
  order,
  link_enabled,
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

/** The `skills` body of the last save, as [id, enabled] pairs. */
function lastSaved() {
  const [{ skills }] = mutate.mock.calls.at(-1)!;
  return skills.map((e: { skill_id: string; enabled: boolean }) => [e.skill_id, e.enabled]);
}

const rubric = skill("pr-quality-rubric", { type: "rubric" });
const chains = skill("no-then-chains", { type: "convention" });
const secrets = skill("secret-leakage-gate");
const nudge = skill("test-coverage-nudge", { type: "custom" });

beforeEach(() => {
  mutate.mockReset();
  all = [rubric, chains, secrets, nudge];
  linked = [link(rubric, 0, true), link(chains, 1, false), link(secrets, 2, true)];
});
afterEach(cleanup);

describe("SkillsTab", () => {
  it("lists every workspace skill, enabled ones first in prompt order, and counts them", () => {
    renderTab();
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
    const order = within(screen.getByRole("list", { name: "Skills" }))
      .getAllByRole("listitem")
      .map((li) => li.getAttribute("data-testid"));
    expect(order).toEqual([
      "skill-row-pr-quality-rubric",
      "skill-row-secret-leakage-gate",
      "skill-row-no-then-chains",
      "skill-row-test-coverage-nudge",
    ]);
  });

  it("ticking a skill links it at the end of the prompt", () => {
    renderTab();
    fireEvent.click(within(screen.getByTestId("skill-row-test-coverage-nudge")).getByRole("checkbox"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(lastSaved()).toEqual([
      ["id-pr-quality-rubric", true],
      ["id-secret-leakage-gate", true],
      ["id-test-coverage-nudge", true],
      ["id-no-then-chains", false],
    ]);
  });

  it("unticking keeps the skill linked but disabled, below the enabled ones", () => {
    renderTab();
    fireEvent.click(within(screen.getByTestId("skill-row-pr-quality-rubric")).getByRole("checkbox"));
    expect(lastSaved().slice(0, 2)).toEqual([
      ["id-secret-leakage-gate", true],
      ["id-pr-quality-rubric", false],
    ]);
  });

  it("reorders with ↑ / ↓ on the drag handle", () => {
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: /secret-leakage-gate: drag/ }), { key: "ArrowUp" });
    expect(lastSaved().map(([id]: [string]) => id)).toEqual([
      "id-secret-leakage-gate",
      "id-pr-quality-rubric",
      "id-no-then-chains",
      "id-test-coverage-nudge",
    ]);
  });

  it("only enabled skills can be dragged", () => {
    renderTab();
    expect(screen.getByTestId("skill-row-pr-quality-rubric")).toHaveAttribute("draggable", "true");
    expect(screen.getByTestId("skill-row-no-then-chains")).toHaveAttribute("draggable", "false");
    expect(screen.getByRole("button", { name: /no-then-chains: drag/ })).toBeDisabled();
    // The last enabled skill can't move down into the disabled ones.
    fireEvent.keyDown(screen.getByRole("button", { name: /secret-leakage-gate: drag/ }), { key: "ArrowDown" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("does not save when the first skill can't move further up", () => {
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: /pr-quality-rubric: drag/ }), { key: "ArrowUp" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("marks a globally disabled skill", () => {
    all = [skill("lethal-trifecta", { enabled: false })];
    linked = [];
    renderTab();
    expect(screen.getByText("disabled globally")).toBeInTheDocument();
  });
});
