import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { acceptedStats, applyFrozenOrder, categoryCounts, sortConventions, timeAgo } from "./helpers";

const c = (id: string, status: ConventionCandidate["status"], confidence: number, category: ConventionCandidate["category"] = "general") =>
  ({ id, status, confidence, category }) as ConventionCandidate;

describe("ConventionsView helpers", () => {
  it("sorts accepted, then pending, then rejected; by confidence inside", () => {
    const list = [c("r", "rejected", 0.9), c("p1", "pending", 0.5), c("a", "accepted", 0.4), c("p2", "pending", 0.8)];
    expect(sortConventions(list).map((x) => x.id)).toEqual(["a", "p2", "p1", "r"]);
  });

  it("counts accepted out of the non-rejected ones", () => {
    expect(acceptedStats([c("a", "accepted", 1), c("p", "pending", 1), c("r", "rejected", 1)])).toEqual({
      accepted: 1,
      total: 2,
    });
  });

  it("counts categories in first-seen order", () => {
    expect(categoryCounts([c("1", "pending", 1, "naming"), c("2", "pending", 1, "errors"), c("3", "pending", 1, "naming")])).toEqual([
      ["naming", 2],
      ["errors", 1],
    ]);
  });

  it("formats a relative time", () => {
    const now = Date.parse("2026-09-19T12:00:00Z");
    expect(timeAgo("2026-09-19T11:00:00Z", now)).toBe("1 hour ago");
    expect(timeAgo("2026-09-19T11:59:40Z", now)).toBe("this minute");
  });

  it("applyFrozenOrder keeps a fixed order and puts unknown ids last", () => {
    const list = [c("b", "accepted", 1), c("a", "pending", 1), c("new", "pending", 1)];
    expect(applyFrozenOrder(list, ["a", "b"]).map((x) => x.id)).toEqual(["a", "b", "new"]);
    expect(applyFrozenOrder(list, null)).toBe(list);
  });
});
