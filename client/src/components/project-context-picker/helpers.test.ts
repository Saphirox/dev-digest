import { describe, it, expect } from "vitest";
import type { SpecFile } from "@devdigest/shared";
import { buildRows, filterRows, moveTo, splitPath, sumTokens, toggle } from "./helpers";

const f = (path: string, tokens: number | null, type: SpecFile["type"] = "specs"): SpecFile => ({ path, type, tokens });

const FILES = [f("specs/a.md", 100), f("specs/b.md", 50), f("docs/c.md", null, "docs")];

describe("splitPath", () => {
  it("splits the file name from its folder", () => {
    expect(splitPath("docs/specs/x.md")).toEqual({ name: "x.md", folder: "docs/specs/" });
    expect(splitPath("README.md")).toEqual({ name: "README.md", folder: "" });
  });
});

describe("buildRows", () => {
  it("lists attached paths first in stored order, then the rest in list order", () => {
    const rows = buildRows(FILES, ["docs/c.md", "specs/a.md"]);
    expect(rows.map((r) => r.path)).toEqual(["docs/c.md", "specs/a.md", "specs/b.md"]);
    expect(rows.map((r) => r.attached)).toEqual([true, true, false]);
  });

  it("marks an attached path the list no longer has as missing", () => {
    const rows = buildRows(FILES, ["specs/gone.md"]);
    expect(rows[0]).toMatchObject({ path: "specs/gone.md", attached: true, missing: true, type: null, tokens: null });
    expect(rows.slice(1).every((r) => !r.missing)).toBe(true);
  });

  it("keeps an unknown token count null, never 0", () => {
    expect(buildRows(FILES, []).find((r) => r.path === "docs/c.md")?.tokens).toBeNull();
  });
});

describe("moveTo", () => {
  it("moves a path and clamps to the attached block", () => {
    expect(moveTo(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveTo(["a", "b", "c"], "c", -5)).toEqual(["c", "a", "b"]);
    expect(moveTo(["a", "b", "c"], "c", 9)).toEqual(["a", "b", "c"]);
  });

  it("returns the same array for no move or an unattached path", () => {
    const v = ["a", "b"];
    expect(moveTo(v, "a", 0)).toBe(v);
    expect(moveTo(v, "z", 1)).toBe(v);
  });
});

describe("toggle", () => {
  it("appends on tick, never twice, and removes on untick", () => {
    expect(toggle(["a"], "b", true)).toEqual(["a", "b"]);
    const v = ["a"];
    expect(toggle(v, "a", true)).toBe(v);
    expect(toggle(["a", "b"], "a", false)).toEqual(["b"]);
  });
});

describe("filterRows", () => {
  it("matches the path ignoring case", () => {
    const rows = buildRows(FILES, []);
    expect(filterRows(rows, "  DOCS/").map((r) => r.path)).toEqual(["docs/c.md"]);
    expect(filterRows(rows, "")).toBe(rows);
  });
});

describe("sumTokens", () => {
  it("sums the known counts of the attached rows only", () => {
    expect(sumTokens(buildRows(FILES, ["specs/a.md", "specs/b.md"]))).toBe(150);
    expect(sumTokens(buildRows(FILES, ["specs/a.md", "docs/c.md"]))).toBe(100);
  });

  it("is null (shown as —) when attached documents exist but none has a count, 0 when none is attached", () => {
    expect(sumTokens(buildRows(FILES, ["docs/c.md"]))).toBeNull();
    expect(sumTokens(buildRows(FILES, []))).toBe(0);
  });
});
