import { describe, it, expect } from "vitest";
import type { Agent } from "@devdigest/shared";
import { applyOrder, filterAgents, railOrder } from "./helpers";

const agent = (id: string, enabled: boolean, name = id): Agent =>
  ({ id, name, description: "", enabled }) as Agent;

describe("AgentsRail helpers", () => {
  it("railOrder puts enabled agents first, keeping the API order in each group", () => {
    expect(railOrder([agent("a", false), agent("b", true), agent("c", false), agent("d", true)])).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });

  it("applyOrder keeps the frozen order after an agent is toggled", () => {
    const order = ["b", "a"];
    const toggled = [agent("a", true), agent("b", false)]; // server order, flags flipped
    expect(applyOrder(toggled, order).map((a) => a.id)).toEqual(["b", "a"]);
  });

  it("applyOrder puts agents created since first, and drops deleted ones", () => {
    const order = ["b", "gone", "a"];
    expect(applyOrder([agent("a", true), agent("b", true), agent("new", true)], order).map((a) => a.id)).toEqual([
      "new",
      "b",
      "a",
    ]);
  });

  it("applyOrder without a frozen order returns the input", () => {
    const list = [agent("a", true)];
    expect(applyOrder(list, null)).toBe(list);
  });

  it("filterAgents matches name or description", () => {
    expect(filterAgents([agent("a", true, "Security"), agent("b", true, "Perf")], "sec").map((a) => a.id)).toEqual([
      "a",
    ]);
  });
});
