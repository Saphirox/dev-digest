import { describe, it, expect } from "vitest";
import { specsReadRows } from "./helpers";

describe("specsReadRows", () => {
  it("lists injected documents in order with their recorded tokens and status", () => {
    const rows = specsReadRows(
      ["specs/a.md", "docs/b.md"],
      [
        { path: "docs/b.md", tokens: 40, status: "truncated" },
        { path: "specs/a.md", tokens: 212, status: "included" },
      ],
    );
    expect(rows).toEqual([
      { path: "specs/a.md", tokens: 212, status: "included" },
      { path: "docs/b.md", tokens: 40, status: "truncated" },
    ]);
  });

  it("appends missing documents after the injected ones and leaves dropped ones out", () => {
    const rows = specsReadRows(
      ["specs/a.md"],
      [
        { path: "specs/a.md", tokens: 5, status: "included" },
        { path: "specs/gone.md", tokens: null, status: "missing" },
        { path: "specs/late.md", tokens: 9, status: "dropped" },
      ],
    );
    expect(rows.map((r) => [r.path, r.status])).toEqual([
      ["specs/a.md", "included"],
      ["specs/gone.md", "missing"],
    ]);
  });

  it("keeps an unknown token count null and copes with an old trace without project_context", () => {
    expect(specsReadRows(["specs/a.md"], null)).toEqual([{ path: "specs/a.md", tokens: null, status: "included" }]);
    expect(specsReadRows([], undefined)).toEqual([]);
  });
});
