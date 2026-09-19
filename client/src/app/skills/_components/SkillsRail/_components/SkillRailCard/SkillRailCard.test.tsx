import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillSummary } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { SkillRailCard } from "./SkillRailCard";

afterEach(cleanup);

const SKILL: SkillSummary = {
  id: "s1",
  name: "secret-leakage-gate",
  description: "Detects sk_live, service_role and NEXT_PUBLIC_ keys.",
  type: "security",
  source: "community",
  body: "b",
  enabled: true,
  version: 3,
  evidence_files: null,
  used_by: 1,
};

function renderCard(props: { onOpen?: () => void; onToggle?: (v: boolean) => void; onDelete?: () => void } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillRailCard
        skill={SKILL}
        onOpen={props.onOpen ?? (() => {})}
        onToggle={props.onToggle ?? (() => {})}
        onDelete={props.onDelete ?? (() => {})}
      />
    </NextIntlClientProvider>,
  );
}

describe("SkillRailCard", () => {
  it("shows name, description, type, provenance and usage", () => {
    renderCard();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("Detects sk_live, service_role and NEXT_PUBLIC_ keys.")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("Community")).toBeInTheDocument();
    expect(screen.getByText("1 agent")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
  });

  it("asks to delete without opening the skill", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    renderCard({ onOpen, onDelete });
    fireEvent.click(screen.getByRole("button", { name: "Delete secret-leakage-gate" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("toggles the global switch without opening the skill", () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    renderCard({ onOpen, onToggle });
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    fireEvent.keyDown(screen.getByRole("switch"), { key: "Enter" });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("opens the skill on click and on Enter", () => {
    const onOpen = vi.fn();
    renderCard({ onOpen });
    const card = screen.getByRole("button", { name: "secret-leakage-gate" });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
