import { describe, it, expect } from "vitest";
import { diffStats, lineDiff } from "./helpers";

describe("lineDiff", () => {
  it("marks removed and added lines, keeps shared ones", () => {
    expect(lineDiff("a\nb\nc", "a\nx\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });

  it("handles appended and dropped tails", () => {
    expect(lineDiff("a", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "add", text: "b" },
    ]);
    expect(lineDiff("a\nb", "a")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
    ]);
  });

  it("counts changes", () => {
    expect(diffStats(lineDiff("a\nb", "c\nd\ne"))).toEqual({ added: 3, removed: 2 });
  });
});
