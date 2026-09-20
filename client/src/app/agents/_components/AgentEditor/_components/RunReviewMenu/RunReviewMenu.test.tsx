import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/agents.json";

const push = vi.fn();
const runMutate = vi.fn();
let pulls: PrMeta[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../../../../lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: { id: "repo1" } }) }));
vi.mock("../../../../../../lib/hooks/core", () => ({ usePulls: () => ({ data: pulls }) }));
vi.mock("../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutate: runMutate, isPending: false }),
}));

import { RunReviewMenu } from "./RunReviewMenu";

const pr = (number: number, status: PrMeta["status"], title = `PR ${number}`) =>
  ({ id: `pr${number}`, number, title, author: "dev", status }) as PrMeta;

function open() {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <RunReviewMenu agentId="ag1" />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
}

beforeEach(() => {
  push.mockReset();
  runMutate.mockReset();
  pulls = [pr(7, "needs_review"), pr(9, "merged"), pr(12, "reviewed")];
});
afterEach(cleanup);

describe("RunReviewMenu", () => {
  it("lists only open PRs, newest first", () => {
    open();
    expect(screen.getByText("#12 PR 12")).toBeInTheDocument();
    expect(screen.getByText("#7 PR 7")).toBeInTheDocument();
    expect(screen.queryByText("#9 PR 9")).not.toBeInTheDocument();
  });

  it("runs this agent on the picked PR, then opens it", () => {
    open();
    fireEvent.click(screen.getByText("#7 PR 7"));
    const [input, opts] = runMutate.mock.calls[0]!;
    expect(input).toEqual({ prId: "pr7", agentId: "ag1" });
    opts.onSuccess();
    expect(push).toHaveBeenCalledWith("/repos/repo1/pulls/7");
  });

  it("points to the PR list when there are no open PRs", () => {
    pulls = [pr(9, "closed")];
    open();
    fireEvent.click(screen.getByText(/No open PRs/));
    expect(push).toHaveBeenCalledWith("/repos/repo1/pulls");
  });
});
