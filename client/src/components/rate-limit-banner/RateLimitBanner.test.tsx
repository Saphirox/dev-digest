import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RateLimitBanner } from "./RateLimitBanner";

afterEach(cleanup);

describe("RateLimitBanner", () => {
  it("renders nothing when there is no active rate limit", () => {
    const { container } = render(<RateLimitBanner retryAfterSeconds={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the retry countdown after a 429", () => {
    render(<RateLimitBanner retryAfterSeconds={30} />);
    expect(screen.getByRole("status")).toHaveTextContent("Rate limited, retry in 30s");
  });

  it("renders nothing once the countdown reaches zero", () => {
    const { container } = render(<RateLimitBanner retryAfterSeconds={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
