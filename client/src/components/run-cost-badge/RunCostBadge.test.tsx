/**
 * RunCostBadge — an unknown cost must never render as a free run, in either
 * variant, and the inline variant must not print a stray "tok ·" separator
 * when it has no token count to show.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("renders the cost on its own in the compact variant", () => {
    render(<RunCostBadge cost={0.014} />);
    expect(screen.getByText("$0.0140")).toBeInTheDocument();
  });

  // $0.00130, not the mockup's $0.0013: the agreed format keeps 3 significant
  // digits at every magnitude rather than a fixed decimal count per screen.
  it("pairs tokens with cost in the inline variant", () => {
    render(<RunCostBadge variant="inline" cost={0.0013} tokens={9119} />);
    expect(screen.getByText("9,119 tok · $0.00130")).toBeInTheDocument();
  });

  it("omits the token separator when there is no token count", () => {
    render(<RunCostBadge variant="inline" cost={0.0013} />);
    expect(screen.getByText("$0.00130")).toBeInTheDocument();
    expect(screen.queryByText(/tok ·/)).not.toBeInTheDocument();
  });

  it.each([
    ["compact", undefined],
    ["inline", 9119],
  ] as const)("shows an em dash, not $0.00, for an unknown cost (%s)", (variant, tokens) => {
    render(<RunCostBadge variant={variant} cost={null} tokens={tokens} />);
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });
});
