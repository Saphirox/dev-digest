/**
 * Eval hooks — NFR-7 (a running suite run is polled every 4 s and the page
 * refreshes when it ends), AC-12 (cases / dashboard / runs refresh then) and
 * EC-19 (one 409 never stops "Run all agents" from starting the others).
 * Mocked at "../api", the specifier hooks/evals.ts imports.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalSuiteRun } from "@devdigest/shared";

const h = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    FakeApiError,
    getCalls: [] as string[],
    getImpl: (_path: string): unknown => [],
    postImpl: async (_path: string): Promise<unknown> => ({ run_id: "r", status: "running" }),
  };
});
vi.mock("../api", () => ({
  ApiError: h.FakeApiError,
  api: {
    get: async (path: string) => {
      h.getCalls.push(path);
      return h.getImpl(path);
    },
    post: (path: string) => h.postImpl(path),
  },
}));

import {
  EVAL_POLL_MS,
  useAgentEvalCases,
  useAgentEvalDashboard,
  useAgentEvalRuns,
  useRunAllAgentEvals,
} from "./evals";

const run = (status: EvalSuiteRun["status"]): EvalSuiteRun => ({
  id: "r1",
  agent_id: "ag1",
  agent_version: 1,
  status,
  started_at: "2026-10-01T10:00:00Z",
  finished_at: null,
  recall: null,
  precision: null,
  citation_accuracy: null,
  cases_passed: null,
  cases_total: 2,
  cost_usd: null,
  error: null,
  failing_case: null,
  model: "m",
  provider: "p",
});

const count = (needle: string) => h.getCalls.filter((p) => p.includes(needle)).length;

function setup<T>(hook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(hook, { wrapper });
}

beforeEach(() => {
  h.getCalls.length = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("useAgentEvalRuns polling", () => {
  it("NFR-7/AC-12: polls every 4 s while a run is running, then refreshes cases, dashboard and runs once it ends and stops polling", async () => {
    let status: EvalSuiteRun["status"] = "running";
    h.getImpl = (path) => (path.includes("/eval-runs") ? [run(status)] : path.includes("/eval-dashboard") ? { agent_id: "ag1" } : []);
    setup(() => {
      useAgentEvalCases("ag1");
      useAgentEvalDashboard("ag1", "all");
      return useAgentEvalRuns("ag1", "all");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(count("/eval-runs")).toBe(1);
    expect(count("/eval-cases")).toBe(1);
    expect(count("/eval-dashboard")).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVAL_POLL_MS);
    });
    expect(count("/eval-runs")).toBe(2);
    expect(count("/eval-cases")).toBe(1);

    status = "done";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVAL_POLL_MS);
      await vi.advanceTimersByTimeAsync(50); // render + effect + the refetches it starts
    });
    // the poll that sees "done" ends the run: everything depending on it is fetched again
    expect(count("/eval-cases")).toBe(2);
    expect(count("/eval-dashboard")).toBe(2);
    const runsAfterEnd = count("/eval-runs");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVAL_POLL_MS * 3);
    });
    expect(count("/eval-runs")).toBe(runsAfterEnd);
  });

  it("does not poll when nothing is running", async () => {
    h.getImpl = () => [run("done")];
    setup(() => useAgentEvalRuns("ag1", "30d"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EVAL_POLL_MS * 3);
    });
    expect(count("/eval-runs?period=30d")).toBe(1);
  });
});

describe("useRunAllAgentEvals", () => {
  it("EC-19: a 409 marks that agent already running and the others still start", async () => {
    h.postImpl = async (path) => {
      if (path.includes("/ag2/")) throw new h.FakeApiError("a run is already in progress", 409);
      if (path.includes("/ag3/")) throw new h.FakeApiError("boom", 500);
      return { run_id: "r", status: "running" };
    };
    h.getImpl = () => ({ agents: [], recent_runs: [] });
    const { result } = setup(() => useRunAllAgentEvals());
    let outcomes: unknown;
    await act(async () => {
      outcomes = await result.current.mutateAsync(["ag1", "ag2", "ag3"]);
    });
    expect(outcomes).toEqual([
      { agentId: "ag1", status: "started" },
      { agentId: "ag2", status: "already_running" },
      { agentId: "ag3", status: "failed", message: "boom" },
    ]);
  });
});
