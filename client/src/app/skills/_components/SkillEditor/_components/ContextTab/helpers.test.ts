import { describe, it, expect } from "vitest";
import { serializeAs } from "./helpers";

describe("serializeAs", () => {
  it("writes the heading and one '- <path>' line per document, in order", () => {
    expect(serializeAs(["specs/a.md", "docs/b.md"])).toBe("## Project specifications\n- specs/a.md\n- docs/b.md");
  });

  it("writes just the heading for no documents", () => {
    expect(serializeAs([])).toBe("## Project specifications");
  });
});
