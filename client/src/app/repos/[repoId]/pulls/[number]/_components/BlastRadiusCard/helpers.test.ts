/**
 * BlastRadiusCard helpers — totals (`blastTotals`) and the mermaid builder
 * (`buildBlastMermaid`). The mermaid case uses a hostile symbol/caller name
 * to prove labels are escaped rather than trusted (untrusted repo content).
 */
import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { blastTotals, buildBlastMermaid, escapeMermaidLabel, symbolKey } from "./helpers";

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" },
    { name: "bucketKey", file: "src/middleware/ratelimit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      file: "src/middleware/ratelimit.ts",
      callers: [
        { name: "publicRouter", file: "src/api/public/index.ts", line: 23 },
        { name: "webhookHandler", file: "src/api/public/webhooks.ts", line: 45 },
      ],
      endpoints_affected: ["GET /api/public/items", "POST /api/public/webhooks"],
      crons_affected: ["reset-rate-buckets (hourly)"],
      rank: 5,
    },
    {
      symbol: "bucketKey",
      file: "src/middleware/ratelimit.ts",
      callers: [{ name: "rateLimit", file: "src/middleware/ratelimit.ts", line: 41 }],
      endpoints_affected: [],
      crons_affected: ["reset-rate-buckets (hourly)"],
      rank: 2,
    },
  ],
  summary: null,
};

describe("blastTotals", () => {
  it("sums callers across symbols and dedupes endpoints/crons shared by more than one symbol", () => {
    expect(blastTotals(BLAST)).toEqual({
      symbols: 2,
      callers: 3,
      endpoints: 2,
      crons: 1, // "reset-rate-buckets (hourly)" is shared by both symbols
    });
  });

  it("returns all zeros for an empty blast radius", () => {
    expect(blastTotals({ changed_symbols: [], downstream: [], summary: null })).toEqual({
      symbols: 0,
      callers: 0,
      endpoints: 0,
      crons: 0,
    });
  });
});

describe("symbolKey", () => {
  it("disambiguates two changed files declaring the same symbol name", () => {
    const a = symbolKey({ symbol: "handle", file: "src/a.ts", callers: [], endpoints_affected: [], crons_affected: [] });
    const b = symbolKey({ symbol: "handle", file: "src/b.ts", callers: [], endpoints_affected: [], crons_affected: [] });
    expect(a).not.toBe(b);
  });
});

describe("escapeMermaidLabel", () => {
  it('replaces " with #quot; and strips <>[]{}()|', () => {
    expect(escapeMermaidLabel('say "hi" <script>[x]{y}(z)|pipe')).toBe("say #quot;hi#quot; scriptxyzpipe");
  });
});

describe("buildBlastMermaid", () => {
  it("escapes a hostile symbol name rather than breaking node syntax", () => {
    const hostile: BlastRadius = {
      changed_symbols: [{ name: 'evil"](x)', file: "src/a.ts", kind: "function" }],
      downstream: [
        {
          symbol: 'evil"](x)',
          file: "src/a.ts",
          callers: [{ name: "caller[1]", file: "src/b.ts", line: 3 }],
          endpoints_affected: ["GET /x|y"],
          crons_affected: [],
        },
      ],
      summary: null,
    };
    const { chart } = buildBlastMermaid(hostile);
    expect(chart).not.toContain('"](x)');
    expect(chart).toContain("evil#quot;x");
    expect(chart).toContain("caller1");
    expect(chart).toContain("GET /xy");
    expect(chart.startsWith("flowchart LR")).toBe(true);
  });

  it("connects a zero-caller symbol's endpoints directly to the symbol node", () => {
    const zeroCallers: BlastRadius = {
      changed_symbols: [{ name: "handler", file: "src/a.ts", kind: "function" }],
      downstream: [
        {
          symbol: "handler",
          file: "src/a.ts",
          callers: [],
          endpoints_affected: ["GET /x"],
          crons_affected: [],
        },
      ],
      summary: null,
    };
    const { chart, truncated } = buildBlastMermaid(zeroCallers);
    expect(truncated).toBe(false);
    // symbol node id (n0) connects straight to the endpoint node (n1)
    expect(chart).toContain("n0 --> n1");
  });

  it("caps nodes at GRAPH_MAX_NODES and reports truncated", () => {
    const many: BlastRadius = {
      changed_symbols: [{ name: "hub", file: "src/hub.ts", kind: "function" }],
      downstream: [
        {
          symbol: "hub",
          file: "src/hub.ts",
          callers: Array.from({ length: 60 }, (_, i) => ({
            name: `caller${i}`,
            file: `src/c${i}.ts`,
            line: i,
          })),
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
      summary: null,
    };
    const { truncated } = buildBlastMermaid(many);
    expect(truncated).toBe(true);
  });
});
