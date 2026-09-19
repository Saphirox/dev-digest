import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../../lib/hooks/agents", () => ({ useUpdateAgent: () => ({ mutate: vi.fn() }) }));

import { AgentsRail } from "./AgentsRail";

afterEach(cleanup);

const agent = (id: string, enabled: boolean): Agent =>
  ({ id, name: `Agent ${id}`, description: "", model: "gpt-4.1", enabled, skill_count: 0 }) as Agent;

function rail(agents: Agent[]) {
  return (
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <AgentsRail agents={agents} isLoading={false} isError={false} onRetry={() => {}} tab="config" onCreate={() => {}} />
    </NextIntlClientProvider>
  );
}

const names = () => screen.getAllByRole("button", { name: /^Agent / }).map((b) => b.getAttribute("aria-label"));

describe("AgentsRail order", () => {
  it("lists enabled agents first on first load", () => {
    render(rail([agent("a", false), agent("b", true), agent("c", true)]));
    expect(names()).toEqual(["Agent b", "Agent c", "Agent a"]);
  });

  it("keeps its order when an agent is toggled, and re-sorts only on a fresh mount", () => {
    const { rerender, unmount } = render(rail([agent("a", false), agent("b", true)]));
    expect(names()).toEqual(["Agent b", "Agent a"]);
    rerender(rail([agent("a", true), agent("b", false)])); // refetch after toggles
    expect(names()).toEqual(["Agent b", "Agent a"]);
    unmount();
    render(rail([agent("a", true), agent("b", false)])); // page reload
    expect(names()).toEqual(["Agent a", "Agent b"]);
  });
});
