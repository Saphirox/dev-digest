import { describe, it, expect } from "vitest";
import { blobSha, formatFileRef, formatTokenCount, isNewFile, refTarget } from "./helpers";

describe("PrBriefBlock helpers", () => {
  it("AC-15: formats a ref as path, path:line or path:start-end", () => {
    expect(formatFileRef("src/a.ts")).toBe("src/a.ts");
    expect(formatFileRef("src/a.ts", 12)).toBe("src/a.ts:12");
    expect(formatFileRef("src/a.ts", 12, 12)).toBe("src/a.ts:12");
    expect(formatFileRef("src/a.ts", 12, 18)).toBe("src/a.ts:12-18");
  });

  it("AC-17/AC-18: a PR file opens in-app, any other file links out", () => {
    const prPaths = new Set(["src/config.ts"]);
    expect(refTarget("src/config.ts", prPaths)).toBe("pr");
    expect(refTarget("src/server.ts", prPaths)).toBe("blast");
  });

  it("AC-18: links at the indexed sha, falling back to the head sha", () => {
    expect(blobSha({ indexed_sha: "idx111" }, "head222")).toBe("idx111");
    expect(blobSha({ indexed_sha: null }, "head222")).toBe("head222");
    expect(blobSha({}, "head222")).toBe("head222");
    expect(blobSha(undefined, "head222")).toBe("head222");
  });

  it("AC-14: formats a token count compactly, keeping zero as 0", () => {
    expect(formatTokenCount(8200)).toBe("8.2K");
    expect(formatTokenCount(1300)).toBe("1.3K");
    expect(formatTokenCount(950)).toBe("950");
    expect(formatTokenCount(0)).toBe("0");
  });
});

describe("isNewFile", () => {
  it("is true only for a patch whose old side is empty", () => {
    expect(isNewFile("@@ -0,0 +1,40 @@\n+a")).toBe(true);
    expect(isNewFile("@@ -1,3 +1,4 @@\n a")).toBe(false);
    expect(isNewFile(null)).toBe(false);
  });
});
