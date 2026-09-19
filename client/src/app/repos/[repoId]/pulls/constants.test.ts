/**
 * COLUMNS — the one source for the PR list's grid, header and cells. The cells
 * are held in step by the type system (PRRow's Record<ColumnKey, …>); the
 * header labels are not, so they are checked here.
 */
import { describe, it, expect } from "vitest";
import messages from "../../../../../messages/en/prReview.json";
import { COLUMNS, GRID } from "./constants";

describe("COLUMNS", () => {
  it("gives every column a header label under list.columns", () => {
    const labels: Record<string, string> = messages.list.columns;
    for (const c of COLUMNS) expect(labels[c.key], c.key).toBeTruthy();
  });

  it("derives one grid track per column", () => {
    expect(GRID.split(" ")).toHaveLength(COLUMNS.length);
  });
});
