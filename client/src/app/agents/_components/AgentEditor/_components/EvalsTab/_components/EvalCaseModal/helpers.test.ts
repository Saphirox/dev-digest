import { describe, it, expect } from "vitest";
import { diffLineKind, expectationToJson, parseExpectationJson } from "./helpers";

describe("parseExpectationJson", () => {
  it("EC-20: returns the object for valid JSON", () => {
    expect(parseExpectationJson('{"kind":"must_find","file":"a.ts","start_line":1,"end_line":2}')).toEqual({
      kind: "must_find",
      file: "a.ts",
      start_line: 1,
      end_line: 2,
    });
  });

  it("EC-20: is null for text that does not parse, or is not an object", () => {
    expect(parseExpectationJson("{ nope")).toBeNull();
    expect(parseExpectationJson("[]")).toBeNull();
    expect(parseExpectationJson("42")).toBeNull();
    expect(parseExpectationJson("null")).toBeNull();
  });

  it("round-trips an expectation", () => {
    const e = { kind: "must_not_flag", file: "a.ts", start_line: 3, end_line: 3 } as const;
    expect(parseExpectationJson(expectationToJson(e))).toEqual(e);
  });
});

describe("diffLineKind", () => {
  it("tells headers, hunks, additions, deletions and context apart", () => {
    expect(diffLineKind("--- a/x.ts")).toBe("meta");
    expect(diffLineKind("+++ b/x.ts")).toBe("meta");
    expect(diffLineKind("diff --git a/x.ts b/x.ts")).toBe("meta");
    expect(diffLineKind("@@ -1,2 +1,3 @@")).toBe("hunk");
    expect(diffLineKind('+  key: "x"')).toBe("add");
    expect(diffLineKind("-  old")).toBe("del");
    expect(diffLineKind(" same")).toBe("ctx");
  });
});
