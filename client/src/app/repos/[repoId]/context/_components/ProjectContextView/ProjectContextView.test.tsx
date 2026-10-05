import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

const refetch = vi.fn();
let list: { data?: ProjectContextList; isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => void };
const requestedPaths: (string | null)[] = [];

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "repo1", full_name: "acme/payments-api" }] }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => list,
  useContextFile: (_repo: string, path: string | null) => {
    requestedPaths.push(path);
    return { data: path ? { path, type: "specs", tokens: 1, content: `# Body of ${path}` } : undefined, isLoading: false, isError: false };
  },
}));

import { ProjectContextView } from "./ProjectContextView";

beforeEach(() => {
  requestedPaths.length = 0;
  list = {
    data: {
      cloned: true,
      files: [
        { path: "specs/public-api.md", type: "specs", tokens: 105 },
        { path: "specs/security-baseline.md", type: "specs", tokens: null },
        { path: "docs/architecture.md", type: "docs", tokens: 40 },
      ],
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch,
  };
});
afterEach(() => {
  cleanup();
  refetch.mockReset();
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("AC-3: shows the repository root and the documents as a tree with folder labels", () => {
    renderView();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText("specs/")).toBeInTheDocument();
    expect(screen.getByText("docs/")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "security-baseline.md" })).toBeInTheDocument();
  });

  it("AC-4: selecting a document shows its file name and rendered markdown", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "architecture.md" }));
    expect(requestedPaths.at(-1)).toBe("docs/architecture.md");
    expect(screen.getByRole("heading", { name: "Body of docs/architecture.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "architecture.md" })).toHaveAttribute("aria-current", "true");
  });

  it("AC-5: the refresh button requests the list again", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("EC-2: an unknown token count shows — rather than 0", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "security-baseline.md" }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("≈ 0 tokens")).not.toBeInTheDocument();
  });

  it("EC-7: no documents shows the empty state", () => {
    list = { ...list, data: { cloned: true, files: [] } };
    renderView();
    expect(screen.getByText("No spec files yet")).toBeInTheDocument();
  });

  it("EC-8: no clone shows 'Repository not cloned'", () => {
    list = { ...list, data: { cloned: false, files: [] } };
    renderView();
    expect(screen.getByText("Repository not cloned")).toBeInTheDocument();
  });
});
