import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/multiAgent.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import MultiAgentLandingPage from "./page";

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("Multi-Agent landing", () => {
  it("AC-12: shows 'No agents selected' and Configure run opens the configure page", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
        <MultiAgentLandingPage />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("No agents selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(push).toHaveBeenCalledWith("/multi-agent/configure");
  });
});
