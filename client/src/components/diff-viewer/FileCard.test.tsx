/**
 * FileCard — the `pathAdornment` slot Smart Diff's per-severity findings dots
 * use, plus the uncontrolled/controlled `open` behaviour its dot click relies
 * on (`docs/plans/0004-smart-diff.md` step 8). The slot is an optional
 * `ReactNode` — with it omitted the render must stay byte-identical to before.
 * The summary chip and "What this does" row, and the two slots that existed
 * only for them, were removed after the summary text proved to be hardcoded
 * English shipped from the server.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shell from "../../../messages/en/shell.json";
import { FileCard } from "./FileCard";
import { AUTO_EXPAND_MAX_LINES } from "./constants";

afterEach(cleanup);

function bigFile(overrides: Partial<PrFile> = {}): PrFile {
  return {
    path: "src/app.ts",
    additions: 3,
    deletions: 1,
    patch: "@@ -1,2 +1,3 @@\n context\n+added line\n-removed line",
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof FileCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      <FileCard file={bigFile()} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard", () => {
  it("pathAdornment renders right after the file path; omitted, the header is unaffected", () => {
    const { unmount } = renderCard();
    expect(screen.queryByTestId("adornment")).not.toBeInTheDocument();
    unmount();

    renderCard({ pathAdornment: <span data-testid="adornment">dot</span> });
    const path = screen.getByText(bigFile().path);
    const adornment = screen.getByTestId("adornment");
    // Both live in the pathWrap span, so the adornment hugs the path text
    // instead of being pushed across to the +N −M stat.
    expect(adornment.parentElement).toBe(path.parentElement);
    const siblings = Array.from(adornment.parentElement!.children);
    expect(siblings.indexOf(adornment)).toBeGreaterThan(siblings.indexOf(path));
  });

  it("uncontrolled open defaults from AUTO_EXPAND_MAX_LINES, and a controlled `open` prop overrides it", () => {
    // additions+deletions (4) <= AUTO_EXPAND_MAX_LINES → auto-open uncontrolled.
    const { unmount: unmountSmall } = renderCard({ file: bigFile({ additions: 3, deletions: 1 }) });
    expect(screen.getByText("added line", { exact: false })).toBeInTheDocument();
    unmountSmall();

    // A file over the auto-expand threshold starts collapsed...
    const big = bigFile({ additions: AUTO_EXPAND_MAX_LINES + 50, deletions: 0 });
    const { unmount: unmountBig } = renderCard({ file: big });
    expect(screen.queryByText("added line", { exact: false })).not.toBeInTheDocument();
    unmountBig();

    // ...unless a controlled `open={true}` forces it open regardless of size.
    renderCard({ file: big, open: true });
    expect(screen.getByText("added line", { exact: false })).toBeInTheDocument();
  });

  it("clicking a controlled card's header calls onOpenChange rather than flipping internal state", () => {
    let open = false;
    const onOpenChange = (next: boolean) => {
      open = next;
    };
    const { rerender } = renderCard({ open, onOpenChange });
    expect(screen.queryByText("added line", { exact: false })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("src/app.ts"));
    expect(open).toBe(true); // the callback fired — the card did not open itself

    // Re-render with the parent's updated state to prove control is external.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <FileCard file={bigFile()} open={open} onOpenChange={onOpenChange} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("added line", { exact: false })).toBeInTheDocument();
  });
});
