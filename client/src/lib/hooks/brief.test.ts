/**
 * useGenerateBrief — AC-22 / EC-6: a successful POST replaces the cached
 * brief; a failed POST leaves the previous brief cached.
 * Mocked at "../api", the specifier hooks/brief.ts imports.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief } from "@devdigest/shared";

let postImpl: () => Promise<unknown> = async () => undefined;
const calls: unknown[][] = [];
const post = (...args: unknown[]) => {
  calls.push(args);
  return postImpl();
};
vi.mock("../api", () => ({ api: { get: vi.fn(), post: (...a: unknown[]) => post(...a) } }));

import { useGenerateBrief } from "./brief";

const mk = (summary: string): PrBrief => ({ summary, risks: [], review_focus: [] }) as unknown as PrBrief;

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  qc.setQueryData(["pr-brief", "pr-1"], mk("old"));
  return { qc, ...renderHook(() => useGenerateBrief("pr-1"), { wrapper }) };
}

describe("useGenerateBrief", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("AC-22: replaces the cached brief with the one returned by a successful POST", async () => {
    postImpl = async () => mk("new");
    const { qc, result } = setup();

    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toEqual([["/pulls/pr-1/brief"]]);
    expect(qc.getQueryData(["pr-brief", "pr-1"])).toEqual(mk("new"));
  });

  it("AC-22 / EC-6: leaves the cached brief unchanged when the POST fails", async () => {
    postImpl = async () => {
      throw new Error("model down");
    };
    const { qc, result } = setup();

    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(["pr-brief", "pr-1"])).toEqual(mk("old"));
  });
});
