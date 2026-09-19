import { describe, it, expect, afterEach, vi } from "vitest";
import { api, ApiError } from "./api";

const tooMany = () =>
  new Response(JSON.stringify({ error: { code: "internal_error", message: "Rate limit exceeded" } }), {
    status: 429,
  });

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch rate limiting", () => {
  it("tries again when the API answers 429 and returns the first good response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tooMany())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as any);
    await expect(api.get("/x")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 retries with the API's message", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => tooMany());
    vi.stubGlobal("fetch", fetchMock as any);
    await expect(api.post("/pulls/1/review", { all: true })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
