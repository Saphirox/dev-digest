import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NAV, Sidebar } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

afterEach(cleanup);

describe("Eval Dashboard sidebar item (AC-22)", () => {
  it("sits in the Skills Lab group and opens /eval", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB");
    const item = lab?.items.find((i) => i.key === "eval");
    expect(item).toMatchObject({ label: "Eval Dashboard", href: "/eval" });
  });

  it("is the active key on /eval and on a per-agent eval page", () => {
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/ag1")).toBe("eval");
  });

  it("is rendered as a link and highlighted while that page is open", () => {
    render(<Sidebar ctx={{ activeKey: "eval", repoId: "r1", repos: [], activeRepo: null }} />);
    const link = screen.getByRole("link", { name: /Eval Dashboard/ });
    expect(link).toHaveAttribute("href", "/eval");
    expect(link.firstElementChild).toHaveStyle({ fontWeight: "600" });
    expect(screen.getByRole("link", { name: /Agents/ }).firstElementChild).toHaveStyle({ fontWeight: "500" });
  });
});
