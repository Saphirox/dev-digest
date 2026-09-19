import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { ConfirmModal } from "./ConfirmModal";

afterEach(cleanup);

function renderModal() {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <ConfirmModal title="Delete skill?" body="Gone for good." confirmLabel="Delete skill" onConfirm={onConfirm} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return { onConfirm, onClose };
}

describe("ConfirmModal", () => {
  it("confirms only on the confirm button", () => {
    const { onConfirm, onClose } = renderModal();
    expect(screen.getByRole("dialog")).toHaveTextContent("Gone for good.");
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without confirming on Cancel and on the ✕", () => {
    const { onConfirm, onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
