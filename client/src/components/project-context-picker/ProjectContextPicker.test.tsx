import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextList, SpecFile } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";

let list: { data?: ProjectContextList; isLoading: boolean; isError: boolean };
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => list,
  useContextFile: (_repo: string, path: string) => ({
    data: { path, type: "specs", tokens: 1, content: "# Preview body" },
    isLoading: false,
    isError: false,
  }),
}));

import { ProjectContextPicker } from "./ProjectContextPicker";

const f = (path: string, type: SpecFile["type"], tokens: number | null): SpecFile => ({ path, type, tokens });
const FILES = [
  f("specs/security-baseline.md", "specs", 212),
  f("specs/public-api.md", "specs", 105),
  f("docs/architecture.md", "docs", null),
];

beforeEach(() => {
  list = { data: { cloned: true, files: FILES }, isLoading: false, isError: false };
});
afterEach(cleanup);

function renderPicker(value: string[], onChange = vi.fn(), extra: { previewIconOnly?: boolean } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextPicker
        repoId="repo1"
        value={value}
        onChange={onChange}
        renderHeader={({ attached, total }) => (
          <span data-testid="counts">
            {attached}/{total}
          </span>
        )}
        footerNote="Injected as an untrusted block."
        {...extra}
      />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("ProjectContextPicker", () => {
  it("AC-6 / NFR-4: rows show a drag handle, checkbox, file name, folder, type badge and Preview; footer counts with ≈", () => {
    renderPicker(["specs/public-api.md"]);
    expect(screen.getByTestId("counts")).toHaveTextContent("1/3");
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("public-api.md")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("specs")).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("checkbox")).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("button", { name: /public-api\.md: drag/ })).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("button", { name: "Preview public-api.md" })).toBeInTheDocument();
    expect(within(rows[0]!).getByText("specs/")).toBeInTheDocument();
    expect(screen.getByText("≈ 105 tokens")).toBeInTheDocument();
    expect(screen.getByText("Injected as an untrusted block.")).toBeInTheDocument();
  });

  it("EC-2: shows — (not 0) when the attached documents have no known token count", () => {
    renderPicker(["docs/architecture.md"]);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/≈ 0 tokens/)).not.toBeInTheDocument();
  });

  it("AC-9: ticking appends the path; unticking removes it", () => {
    const onChange = renderPicker(["specs/public-api.md"]);
    const row = screen.getByTestId("context-row-docs/architecture.md");
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith(["specs/public-api.md", "docs/architecture.md"]);
    fireEvent.click(within(screen.getByTestId("context-row-specs/public-api.md")).getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("AC-10 / NFR-7: moves a focused attached row with ArrowUp / ArrowDown on its handle", () => {
    const onChange = renderPicker(["specs/security-baseline.md", "specs/public-api.md"]);
    const handle = screen.getByRole("button", { name: /public-api\.md: drag, or press/ });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(["specs/public-api.md", "specs/security-baseline.md"]);
    fireEvent.keyDown(screen.getByRole("button", { name: /security-baseline\.md: drag/ }), { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(["specs/public-api.md", "specs/security-baseline.md"]);
  });

  it("AC-10: dragging an attached row onto another reorders the attached paths", () => {
    const onChange = renderPicker(["specs/security-baseline.md", "specs/public-api.md"]);
    const from = screen.getByTestId("context-row-specs/public-api.md");
    const to = screen.getByTestId("context-row-specs/security-baseline.md");
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    fireEvent.dragStart(from, { dataTransfer });
    fireEvent.dragOver(to, { dataTransfer });
    fireEvent.drop(to, { dataTransfer });
    expect(onChange).toHaveBeenLastCalledWith(["specs/public-api.md", "specs/security-baseline.md"]);
  });

  it("AC-8: filters rows by path, ignoring case", () => {
    renderPicker([]);
    fireEvent.change(screen.getByLabelText("Filter documents…"), { target: { value: "DOCS/" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("architecture.md")).toBeInTheDocument();
  });

  it("EC-5: shows an attached path missing from the list as a ticked row whose checkbox detaches it", () => {
    const onChange = renderPicker(["specs/gone.md"]);
    const row = screen.getByTestId("context-row-specs/gone.md");
    expect(within(row).getByText("missing")).toBeInTheDocument();
    const box = within(row).getByRole("checkbox");
    expect(box).toHaveAttribute("aria-checked", "true");
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(within(row).getByRole("button", { name: "Preview gone.md" })).toBeDisabled();
  });

  it("AC-11 / NFR-7: names the drag handle and the Preview button after the file, and previews without changing the set", () => {
    const onChange = renderPicker([], vi.fn(), { previewIconOnly: true });
    expect(screen.getByRole("button", { name: /security-baseline\.md: drag/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview security-baseline.md" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Preview body" })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("EC-7: shows the empty state when the repository has no documents", () => {
    list = { data: { cloned: true, files: [] }, isLoading: false, isError: false };
    renderPicker([]);
    expect(screen.getByText("No spec files yet")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("EC-8: shows 'Repository not cloned' when there is no clone", () => {
    list = { data: { cloned: false, files: [] }, isLoading: false, isError: false };
    renderPicker([]);
    expect(screen.getByText("Repository not cloned")).toBeInTheDocument();
  });
});
