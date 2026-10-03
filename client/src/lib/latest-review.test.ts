import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import { latestReview } from "./latest-review";

const r = (id: string, verdict: ReviewRecord["verdict"]) => ({ id, verdict }) as ReviewRecord;

describe("latestReview", () => {
  it("AC-12: is the newest record, the one the Agent runs tab shows first", () => {
    expect(latestReview([r("a", "approve"), r("b", "comment")])?.id).toBe("a");
  });

  it("AC-12: does not skip a newest record without a verdict for an older run", () => {
    expect(latestReview([r("a", null), r("b", "approve")])?.id).toBe("a");
  });

  it("is null when there are no reviews", () => {
    expect(latestReview([])).toBeNull();
    expect(latestReview(undefined)).toBeNull();
    expect(latestReview(null)).toBeNull();
  });
});
