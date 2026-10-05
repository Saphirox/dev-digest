import { afterEach, describe, expect, it } from "vitest";
import { openRouterBearer } from "./env.js";

const saved = process.env.EVAL_PROXY_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.EVAL_PROXY_KEY;
  else process.env.EVAL_PROXY_KEY = saved;
});

describe("openRouterBearer", () => {
  it("uses the OpenRouter key when no proxy key is set", () => {
    delete process.env.EVAL_PROXY_KEY;
    expect(openRouterBearer("http://localhost:4000", "sk-or")).toBe("sk-or");
  });

  it("uses the proxy key for the local proxy", () => {
    process.env.EVAL_PROXY_KEY = "sk-proxy";
    expect(openRouterBearer("http://localhost:4000", "sk-or")).toBe("sk-proxy");
  });

  it("never sends a leftover proxy key to openrouter.ai", () => {
    process.env.EVAL_PROXY_KEY = "sk-proxy";
    expect(openRouterBearer("https://openrouter.ai/api", "sk-or")).toBe("sk-or");
    expect(openRouterBearer("https://openrouter.ai/api/v1", "sk-or")).toBe("sk-or");
  });
});
