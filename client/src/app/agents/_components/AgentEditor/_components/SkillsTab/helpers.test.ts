import { describe, it, expect } from "vitest";
import type { AgentSkillDetail, Skill } from "@devdigest/shared";
import { buildRows, filterRows, moveTo, setLinkEnabled, toEntries } from "./helpers";

const skill = (id: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name: id,
  description: "",
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  evidence_files: null,
  ...over,
});
const link = (id: string, order: number, link_enabled = true): AgentSkillDetail => ({
  ...skill(id),
  order,
  link_enabled,
});

describe("SkillsTab helpers", () => {
  it("buildRows lists enabled links, then disabled links, then unlinked skills by name", () => {
    const rows = buildRows(
      [link("a", 0, false), link("c", 1), link("d", 2)],
      [skill("a"), skill("z"), skill("b"), skill("c"), skill("d")],
    );
    expect(rows.map((r) => [r.id, r.order, r.link_enabled])).toEqual([
      ["c", 0, true],
      ["d", 1, true],
      ["a", 2, false],
      ["b", 3, false],
      ["z", 4, false],
    ]);
  });

  it("buildRows takes skill fields from the fresh skills list", () => {
    const rows = buildRows([link("a", 0)], [skill("a", { enabled: false, name: "renamed" })]);
    expect(rows[0]).toMatchObject({ name: "renamed", enabled: false, link_enabled: true });
  });

  const rows = [link("a", 0), link("c", 1), link("b", 2, false)];

  it("moveTo reorders and renumbers within the enabled block", () => {
    expect(moveTo(rows, "c", 0).map((r) => [r.id, r.order])).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
    expect(moveTo(rows, "a", 99).map((r) => r.id)).toEqual(["c", "a", "b"]); // clamped above "b"
    expect(moveTo(rows, "a", -1)).toBe(rows);
  });

  it("moveTo never moves a disabled row", () => {
    expect(moveTo(rows, "b", 0)).toBe(rows);
  });

  it("setLinkEnabled appends a ticked row to the enabled block and drops an unticked one below it", () => {
    expect(setLinkEnabled(rows, "b", true).map((r) => [r.id, r.link_enabled])).toEqual([
      ["a", true],
      ["c", true],
      ["b", true],
    ]);
    expect(setLinkEnabled(rows, "a", false).map((r) => [r.id, r.order, r.link_enabled])).toEqual([
      ["c", 0, true],
      ["a", 1, false],
      ["b", 2, false],
    ]);
  });

  it("toEntries saves every row in order with its switch", () => {
    expect(toEntries(rows)).toEqual([
      { skill_id: "a", enabled: true },
      { skill_id: "c", enabled: true },
      { skill_id: "b", enabled: false },
    ]);
  });

  it("filterRows matches name or type", () => {
    expect(filterRows(rows, " B ").map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, "custom")).toHaveLength(3);
  });
});
