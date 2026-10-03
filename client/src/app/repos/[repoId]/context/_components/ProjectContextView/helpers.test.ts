import { describe, it, expect } from "vitest";
import type { SpecFile } from "@devdigest/shared";
import { buildTree, resolveSelected } from "./helpers";

const f = (path: string): SpecFile => ({ path, type: "specs", tokens: 1 });

describe("buildTree", () => {
  it("groups files under their folder in first-seen order", () => {
    const tree = buildTree([f("docs/a.md"), f("specs/b.md"), f("docs/c.md"), f("README.md")]);
    expect(tree.map((g) => g.folder)).toEqual(["docs/", "specs/", ""]);
    expect(tree[0]!.files).toEqual([
      { path: "docs/a.md", name: "a.md" },
      { path: "docs/c.md", name: "c.md" },
    ]);
  });
});

describe("resolveSelected", () => {
  it("keeps a selection the list still has, else falls back to the first document", () => {
    const files = [f("a.md"), f("b.md")];
    expect(resolveSelected(files, "b.md")).toBe("b.md");
    expect(resolveSelected(files, "gone.md")).toBe("a.md");
    expect(resolveSelected([], "a.md")).toBeNull();
  });
});
