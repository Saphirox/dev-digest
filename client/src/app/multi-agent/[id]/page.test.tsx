import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/multiAgent.json";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "m1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const useMultiRun = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useMultiRun: (id: string) => {
    useMultiRun(id);
    return { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
  },
  useRunEvents: () => ({ events: [], running: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import MultiAgentResultsPage from "./page";

afterEach(() => {
  cleanup();
  useMultiRun.mockReset();
});

describe("multi-agent results page", () => {
  it("AC-20: /multi-agent/m1 asks for the multi-run with that id and renders the results view", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
        <MultiAgentResultsPage />
      </NextIntlClientProvider>,
    );
    expect(useMultiRun).toHaveBeenCalledWith("m1");
    expect(screen.getByText(messages.results.loadError)).toBeInTheDocument();
  });
});
